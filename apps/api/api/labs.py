from datetime import datetime, timedelta, timezone
import logging
from typing import Annotated

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, HTTPException, Path
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, StringConstraints
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.config import AWS_REGION
from apps.api.database import get_db
from apps.api.middleware.auth import get_current_user
from apps.api.models.lab_instance import LabInstance
from apps.api.models.lab_template import LabTemplate
from apps.api.models.user import User

router = APIRouter(prefix="/labs", tags=["labs"])
logger = logging.getLogger(__name__)

LAB_STATUS_PROVISIONING = "PROVISIONING"
LAB_STATUS_RUNNING = "RUNNING"
LAB_STATUS_DESTROYING = "DESTROYING"
LAB_STATUS_FAILED = "FAILED"

ACTIVE_LAB_STATUSES = [LAB_STATUS_PROVISIONING, LAB_STATUS_RUNNING]
STOPPABLE_LAB_STATUSES = [LAB_STATUS_PROVISIONING, LAB_STATUS_RUNNING]
TEMPLATE_ID_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9_-]*$"
INSTANCE_ID_PATTERN = (
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-"
    r"[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
)

TemplateId = Annotated[
    str,
    StringConstraints(
        min_length=1,
        max_length=64,
        pattern=TEMPLATE_ID_PATTERN,
    ),
]


class StartLabRequest(BaseModel):
    template_id: TemplateId


def _claims_sub(user_claims: dict) -> str:
    cognito_sub = user_claims.get("sub")
    if not cognito_sub:
        raise HTTPException(status_code=401, detail="Invalid authentication token")
    return cognito_sub


async def _get_current_db_user(db: AsyncSession, cognito_sub: str) -> User:
    try:
        result = await db.execute(
            select(User).where(User.cognito_sub == cognito_sub)
        )
        db_user = result.scalar_one_or_none()
    except SQLAlchemyError:
        logger.exception("Database query failed while loading current user")
        raise HTTPException(status_code=500, detail="Database query failed")

    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    return db_user


async def _get_active_template(db: AsyncSession, template_id: str) -> LabTemplate:
    try:
        result = await db.execute(
            select(LabTemplate).where(
                LabTemplate.id == template_id,
                LabTemplate.is_active.is_(True),
            )
        )
        template = result.scalar_one_or_none()
    except SQLAlchemyError:
        logger.exception("Database query failed while loading lab template")
        raise HTTPException(status_code=500, detail="Database query failed")

    if template is None:
        raise HTTPException(status_code=404, detail="Lab template not found")

    return template


async def _get_owned_instance(
    db: AsyncSession,
    instance_id: str,
    user_id: str,
) -> LabInstance:
    try:
        result = await db.execute(
            select(LabInstance).where(
                LabInstance.id == instance_id,
                LabInstance.user_id == user_id,
            )
        )
        instance = result.scalar_one_or_none()
    except SQLAlchemyError:
        logger.exception("Database query failed while loading lab instance")
        raise HTTPException(status_code=500, detail="Database query failed")

    if instance is None:
        raise HTTPException(status_code=404, detail="Lab instance not found")

    return instance


@router.post("/start")
async def start_lab(
    body: StartLabRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Start a lab session.
    1. Find the user in DB
    2. Find the lab template
    3. Check user has enough credits
    4. Deduct credits
    5. Create LabInstance with status PROVISIONING
    6. Return instance ID immediately (provisioning happens async later)
    """

    db_user = await _get_current_db_user(db, _claims_sub(user))
    template = await _get_active_template(db, body.template_id)

    # Check credits
    if db_user.credits_balance < template.credits_cost:
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient credits. You have {db_user.credits_balance}, this lab costs {template.credits_cost}.",
        )

    # Deduct credits
    db_user.credits_balance -= template.credits_cost

    # Calculate expiry time
    expires_at = datetime.now(timezone.utc) + timedelta(hours=template.ttl_hours)

    # Create lab instance
    instance = LabInstance(
        user_id=db_user.id,
        template_id=template.id,
        status=LAB_STATUS_PROVISIONING,
        cfn_stack_name=None,  # set by Celery worker after CDK deploy
        expires_at=expires_at,
    )
    try:
        db.add(instance)
        await db.commit()
        await db.refresh(instance)
    except SQLAlchemyError:
        await db.rollback()
        logger.exception("Database write failed while creating lab instance")
        raise HTTPException(status_code=500, detail="Database write failed")

    try:
        # Dispatch Celery provisioning task to SQS. Keep the import inside the
        # compensation block so image/package regressions do not leave active
        # rows without queued work.
        from workers.provision import provision_lab

        provision_lab.delay(
            instance_id=instance.id,
            template_id=template.id,
            user_id=db_user.id,
        )
    except Exception:
        logger.exception("Failed to dispatch provisioning task")
        try:
            db_user.credits_balance += template.credits_cost
            instance.status = LAB_STATUS_FAILED
            await db.commit()
        except SQLAlchemyError:
            await db.rollback()
            logger.exception("Failed to compensate lab start after dispatch failure")
        raise HTTPException(status_code=503, detail="Could not queue lab provisioning")

    return {
        "instance_id": instance.id,
        "status": instance.status,
        "template": template.title,
        "expires_at": instance.expires_at,
        "message": "Lab is provisioning. Poll /labs/{id}/status for updates.",
    }


@router.get("/active")
async def get_active_labs(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns all active labs for the current user.
    Active = PROVISIONING or RUNNING.
    """
    db_user = await _get_current_db_user(db, _claims_sub(user))

    try:
        result = await db.execute(
            select(LabInstance).where(
                LabInstance.user_id == db_user.id,
                LabInstance.status.in_(ACTIVE_LAB_STATUSES),
            )
        )
        instances = result.scalars().all()
    except SQLAlchemyError:
        logger.exception("Database query failed while loading active labs")
        raise HTTPException(status_code=500, detail="Database query failed")

    return [
        {
            "instance_id": i.id,
            "template_id": i.template_id,
            "status": i.status,
            "ec2_public_ip": i.ec2_public_ip,
            "expires_at": i.expires_at,
            "started_at": i.started_at,
        }
        for i in instances
    ]


@router.get("/{instance_id}/status")
async def get_lab_status(
    instance_id: str = Path(..., pattern=INSTANCE_ID_PATTERN),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns current status of a lab instance.
    Frontend polls this every 5 seconds during provisioning.
    """
    db_user = await _get_current_db_user(db, _claims_sub(user))
    instance = await _get_owned_instance(db, instance_id, db_user.id)

    return {
        "instance_id": instance.id,
        "status": instance.status,
        "template_id": instance.template_id,
        "ec2_public_ip": instance.ec2_public_ip,
        "expires_at": instance.expires_at,
        "started_at": instance.started_at,
        "flag_submitted": instance.flag_submitted,
    }


@router.delete("/{instance_id}")
async def stop_lab(
    instance_id: str = Path(..., pattern=INSTANCE_ID_PATTERN),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Stop a running lab.
    Updates status to DESTROYING.
    Dispatches Celery destroy task asynchronously.
    """
    db_user = await _get_current_db_user(db, _claims_sub(user))
    instance = await _get_owned_instance(db, instance_id, db_user.id)

    if instance.status not in STOPPABLE_LAB_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot stop a lab with status {instance.status}",
        )

    previous_status = instance.status
    instance.status = LAB_STATUS_DESTROYING
    try:
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        logger.exception("Database write failed while marking lab for teardown")
        raise HTTPException(status_code=500, detail="Database write failed")

    try:
        # Dispatch Celery teardown task to SQS. Importing here keeps task
        # packaging failures recoverable by restoring the previous status.
        from workers.destroy import destroy_lab

        destroy_lab.delay(
            instance_id=instance.id,
            cfn_stack_name=instance.cfn_stack_name or f"orchestryx-lab-{instance.id}",
            secrets_key=instance.secrets_key,
        )
    except Exception:
        logger.exception("Failed to dispatch teardown task")
        try:
            instance.status = previous_status
            await db.commit()
        except SQLAlchemyError:
            await db.rollback()
            logger.exception("Failed to restore lab status after dispatch failure")
        raise HTTPException(status_code=503, detail="Could not queue lab teardown")

    return {
        "instance_id": instance.id,
        "status": instance.status,
        "message": "Lab is being destroyed.",
    }


@router.get("/{instance_id}/config")
async def get_lab_config(
    instance_id: str = Path(..., pattern=INSTANCE_ID_PATTERN),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Download the WireGuard client config for a running lab owned by the user.
    The config is stored in Secrets Manager by the provisioning worker.
    """
    db_user = await _get_current_db_user(db, _claims_sub(user))
    instance = await _get_owned_instance(db, instance_id, db_user.id)

    if instance.status != LAB_STATUS_RUNNING:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot download config for a lab with status {instance.status}",
        )

    if instance.secrets_key is None:
        raise HTTPException(status_code=404, detail="VPN config not found")

    try:
        secrets = boto3.client("secretsmanager", region_name=AWS_REGION)
        secret = secrets.get_secret_value(SecretId=instance.secrets_key)
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code == "ResourceNotFoundException":
            raise HTTPException(status_code=404, detail="VPN config not found")
        logger.exception("Secrets Manager failed while loading VPN config")
        raise HTTPException(status_code=502, detail="Could not load VPN config")
    except BotoCoreError:
        logger.exception("Could not create Secrets Manager client")
        raise HTTPException(status_code=502, detail="Could not load VPN config")

    config = secret.get("SecretString")
    if config is None:
        raise HTTPException(status_code=404, detail="VPN config not found")

    return PlainTextResponse(
        config,
        headers={
            "Content-Disposition": (
                f"attachment; filename=orchestryx-lab-{instance_id}.conf"
            ),
        },
    )
