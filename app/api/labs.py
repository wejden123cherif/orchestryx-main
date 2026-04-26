from datetime import datetime, timedelta, timezone

import boto3
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import AWS_REGION
from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.lab_instance import LabInstance
from app.models.lab_template import LabTemplate
from app.models.user import User

router = APIRouter(prefix="/labs", tags=["labs"])


class StartLabRequest(BaseModel):
    template_id: str


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

    # Get user from DB
    result = await db.execute(
        select(User).where(User.cognito_sub == user["sub"])
    )
    db_user = result.scalar_one_or_none()
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Get lab template
    result = await db.execute(
        select(LabTemplate).where(
            LabTemplate.id == body.template_id,
            LabTemplate.is_active == True,
        )
    )
    template = result.scalar_one_or_none()
    if template is None:
        raise HTTPException(status_code=404, detail="Lab template not found")

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
        status="PROVISIONING",
        cfn_stack_name=None,  # set by Celery worker after CDK deploy
        expires_at=expires_at,
    )
    db.add(instance)
    await db.commit()
    await db.refresh(instance)

    # Dispatch Celery provisioning task to SQS
    from app.workers.provision import provision_lab

    provision_lab.delay(
        instance_id=instance.id,
        template_id=template.id,
        user_id=db_user.id,
    )

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
    result = await db.execute(
        select(User).where(User.cognito_sub == user["sub"])
    )
    db_user = result.scalar_one_or_none()
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(LabInstance).where(
            LabInstance.user_id == db_user.id,
            LabInstance.status.in_(["PROVISIONING", "RUNNING"]),
        )
    )
    instances = result.scalars().all()

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
    instance_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns current status of a lab instance.
    Frontend polls this every 5 seconds during provisioning.
    """
    result = await db.execute(
        select(User).where(User.cognito_sub == user["sub"])
    )
    db_user = result.scalar_one_or_none()
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(LabInstance).where(
            LabInstance.id == instance_id,
            LabInstance.user_id == db_user.id,
        )
    )
    instance = result.scalar_one_or_none()
    if instance is None:
        raise HTTPException(status_code=404, detail="Lab instance not found")

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
    instance_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Stop a running lab.
    Updates status to DESTROYING.
    Dispatches Celery destroy task asynchronously.
    """
    result = await db.execute(
        select(User).where(User.cognito_sub == user["sub"])
    )
    db_user = result.scalar_one_or_none()
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(LabInstance).where(
            LabInstance.id == instance_id,
            LabInstance.user_id == db_user.id,
        )
    )
    instance = result.scalar_one_or_none()
    if instance is None:
        raise HTTPException(status_code=404, detail="Lab instance not found")

    if instance.status not in ["PROVISIONING", "RUNNING"]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot stop a lab with status {instance.status}",
        )

    instance.status = "DESTROYING"
    await db.commit()

    # Dispatch Celery destroy task to SQS
    from app.workers.destroy import destroy_lab

    destroy_lab.delay(
        instance_id=instance.id,
        cfn_stack_name=instance.cfn_stack_name or f"orchestryx-lab-{instance.id}",
        secrets_key=instance.secrets_key,
    )

    return {
        "instance_id": instance.id,
        "status": instance.status,
        "message": "Lab is being destroyed.",
    }


@router.get("/{instance_id}/config")
async def get_lab_config(
    instance_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Download the WireGuard client config for a running lab owned by the user.
    The config is stored in Secrets Manager by the provisioning worker.
    """
    result = await db.execute(
        select(User).where(User.cognito_sub == user["sub"])
    )
    db_user = result.scalar_one_or_none()
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(LabInstance).where(
            LabInstance.id == instance_id,
            LabInstance.user_id == db_user.id,
        )
    )
    instance = result.scalar_one_or_none()
    if instance is None:
        raise HTTPException(status_code=404, detail="Lab instance not found")

    if instance.status != "RUNNING":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot download config for a lab with status {instance.status}",
        )

    if instance.secrets_key is None:
        raise HTTPException(status_code=404, detail="VPN config not found")

    secrets = boto3.client("secretsmanager", region_name=AWS_REGION)
    try:
        secret = secrets.get_secret_value(SecretId=instance.secrets_key)
    except secrets.exceptions.ResourceNotFoundException:
        raise HTTPException(status_code=404, detail="VPN config not found")

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
