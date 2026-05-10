from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import logging
from typing import Annotated

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, HTTPException, Path
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, StringConstraints
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.config import (
    AWS_REGION,
    LAB_ECS_PUBLIC_ACCESS_ENABLED,
    LAB_MAX_ACTIVE_PER_USER,
    LAB_RUNTIME_ENABLED,
    LAB_VPN_CONFIG_INLINE,
    LAB_VPN_CONFIG_SECRET_ID,
)
from apps.api.database import get_db
from apps.api.middleware.auth import get_current_user
from apps.api.models.credit_transaction import CreditTransaction
from apps.api.models.lab_event import LabEvent
from apps.api.models.lab_flag import LabFlag
from apps.api.models.lab_instance import LabInstance
from apps.api.models.lab_template import LabTemplate
from apps.api.models.user import User
from apps.api.services.lab_lifecycle import (
    ACTIVE_LAB_STATUSES,
    LAB_STATUS_DESTROYING,
    LAB_STATUS_FAILED,
    LAB_STATUS_QUEUED,
    LAB_STATUS_READY,
    LAB_STATUS_STOPPED,
    STOPPABLE_LAB_STATUSES,
    normalize_lab_status,
)
from apps.api.services.lab_runtime_ecs import LabRuntimeAwsError, fetch_lab_logs

router = APIRouter(prefix="/labs", tags=["labs"])
logger = logging.getLogger(__name__)

LEGACY_ACTIVE_LAB_STATUSES = [*ACTIVE_LAB_STATUSES, "RUNNING"]
USER_VISIBLE_LAB_STATUSES = [*LEGACY_ACTIVE_LAB_STATUSES, LAB_STATUS_DESTROYING, LAB_STATUS_FAILED, "EXPIRED"]


def _normalize_challenge_path(path: str | None) -> str:
    if path is None:
        return ""

    normalized = path.strip()
    if normalized == "" or normalized == "/":
        return ""
    if not normalized.startswith("/"):
        normalized = "/" + normalized
    return normalized


def _build_challenge_url(instance: LabInstance, template: LabTemplate | None) -> str | None:
    if normalize_lab_status(instance.status) != LAB_STATUS_READY or template is None:
        return None

    host = (
        instance.ecs_public_ip
        if LAB_ECS_PUBLIC_ACCESS_ENABLED and instance.ecs_public_ip
        else instance.ecs_private_ip
    )
    if host:
        return (
            f"http://{host}:{template.challenge_port}"
            f"{_normalize_challenge_path(template.challenge_path)}"
        )

    return (
        f"http://10.8.0.1:{template.challenge_port}"
        f"{_normalize_challenge_path(template.challenge_path)}"
    )


def _hash_flag(flag: str) -> str:
    # Normalize surrounding whitespace before hashing so accidental spaces from
    # copy/paste do not make a correct flag fail validation.
    return hashlib.sha256(flag.strip().encode()).hexdigest()


def _vpn_config_filename(instance_id: str) -> str:
    short_id = "".join(character for character in instance_id if character.isalnum())[:8]
    return f"ox-{short_id.lower() or 'lab'}.conf"


def _render_vpn_config_template(config: str, instance: LabInstance) -> str:
    rendered = config.replace("{instance_id}", instance.id)
    if instance.ecs_private_ip:
        rendered = rendered.replace("{lab_private_ip}", instance.ecs_private_ip)
    if instance.ecs_public_ip:
        rendered = rendered.replace("{lab_public_ip}", instance.ecs_public_ip)
    
    if instance.secrets_key:
        try:
            import json
            secrets = json.loads(instance.secrets_key)
            if "private_key" in secrets:
                rendered = rendered.replace("{client_private_key}", secrets["private_key"])
            if "client_ip" in secrets:
                rendered = rendered.replace("{client_ip}", secrets["client_ip"])
        except Exception:
            pass
            
    return rendered


def _load_secret_string(secret_id: str) -> str | None:
    try:
        secrets = boto3.client("secretsmanager", region_name=AWS_REGION)
        secret = secrets.get_secret_value(SecretId=secret_id)
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code == "ResourceNotFoundException":
            return None
        logger.exception("Secrets Manager failed while loading runtime access config")
        raise HTTPException(status_code=502, detail="Could not load runtime access config")
    except BotoCoreError:
        logger.exception("Could not create Secrets Manager client")
        raise HTTPException(status_code=502, detail="Could not load runtime access config")

    return secret.get("SecretString")


def _is_correct_flag(
    submitted_flag: str,
    instance: LabInstance,
    lab_flag: LabFlag | None,
) -> bool:
    # Hash the user submission and compare hashes instead of storing or
    # comparing plain-text template flags.
    submitted_hash = _hash_flag(submitted_flag)

    # hmac.compare_digest avoids timing leaks during hash comparison.
    if lab_flag is not None and hmac.compare_digest(submitted_hash, lab_flag.flag_hash):
        return True

    # The provisioning worker currently injects this per-instance value into
    # custom challenge containers as the FLAG environment variable.
    dynamic_flag_hash = _hash_flag(f"ORCHESTRYX{{{instance.id}}}")
    return hmac.compare_digest(submitted_hash, dynamic_flag_hash)


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


class SubmitFlagRequest(BaseModel):
    # The flag input is intentionally bounded so a malformed request cannot
    # send an arbitrarily large body into the hash/compare path.
    flag: Annotated[str, StringConstraints(min_length=1, max_length=256)]


class LabLogsResponse(BaseModel):
    events: list[dict]
    next_forward_token: str | None = None


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


def _active_limit_for_user(db_user: User) -> int:
    if db_user.max_active_labs is not None:
        return db_user.max_active_labs
    if db_user.subscription_tier == "pro":
        return max(4, LAB_MAX_ACTIVE_PER_USER)
    return LAB_MAX_ACTIVE_PER_USER


def _serialize_instance(
    instance: LabInstance,
    template: LabTemplate | None,
) -> dict:
    status = normalize_lab_status(instance.status)
    return {
        "instance_id": instance.id,
        "template_id": instance.template_id,
        "status": status,
        "progress": instance.progress,
        "status_message": instance.status_message,
        "failure_reason": instance.failure_reason,
        "ec2_public_ip": instance.ec2_public_ip,
        "ecs_task_arn": instance.ecs_task_arn,
        "ecs_last_status": instance.ecs_last_status,
        "ecs_private_ip": instance.ecs_private_ip,
        "ecs_public_ip": instance.ecs_public_ip,
        "challenge_url": _build_challenge_url(instance, template),
        "expires_at": instance.expires_at,
        "started_at": instance.started_at,
        "ready_at": instance.ready_at,
        "last_status_at": instance.last_status_at,
        "flag_submitted": instance.flag_submitted,
    }


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
    Start a lab session and return immediately after the provisioning task is queued.
    """

    if not LAB_RUNTIME_ENABLED:
        raise HTTPException(
            status_code=501,
            detail=(
                "Lab runtime is disabled. Orchestryx platform deployment is active, "
                "but lab provisioning is not implemented in this build."
            ),
        )

    cognito_sub = _claims_sub(user)
    try:
        user_result = await db.execute(
            select(User)
            .where(User.cognito_sub == cognito_sub)
            .with_for_update()
        )
        db_user = user_result.scalar_one_or_none()
    except SQLAlchemyError:
        logger.exception("Database query failed while locking current user")
        raise HTTPException(status_code=500, detail="Database query failed")

    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if db_user.is_disabled:
        raise HTTPException(status_code=403, detail="This account is disabled.")

    template = await _get_active_template(db, body.template_id)

    try:
        active_count_result = await db.execute(
            select(func.count()).select_from(LabInstance).where(
                LabInstance.user_id == db_user.id,
                LabInstance.status.in_(LEGACY_ACTIVE_LAB_STATUSES),
            )
        )
        active_count = int(active_count_result.scalar_one())
    except SQLAlchemyError:
        logger.exception("Database query failed while counting active labs")
        raise HTTPException(status_code=500, detail="Database query failed")

    active_limit = _active_limit_for_user(db_user)
    if active_count >= active_limit:
        raise HTTPException(
            status_code=429,
            detail=f"Active lab limit reached ({active_limit}). Stop a lab before starting another.",
        )

    if db_user.credits_balance < template.credits_cost:
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient credits. You have {db_user.credits_balance}, this lab costs {template.credits_cost}.",
        )

    db_user.credits_balance -= template.credits_cost

    expires_at = datetime.now(timezone.utc) + timedelta(hours=template.ttl_hours)

    instance = LabInstance(
        user_id=db_user.id,
        template_id=template.id,
        status=LAB_STATUS_QUEUED,
        progress=5,
        status_message="Queued for provisioning.",
        cfn_stack_name=None,
        expires_at=expires_at,
        last_status_at=datetime.now(timezone.utc),
    )
    try:
        db.add(instance)
        await db.flush()
        db.add(
            CreditTransaction(
                user_id=db_user.id,
                delta=-float(template.credits_cost),
                reason=f"Lab start: {template.id} ({instance.id})",
            )
        )
        db.add(
            LabEvent(
                instance_id=instance.id,
                level="info",
                phase="queued",
                message="Lab launch accepted and queued.",
                progress=5,
            )
        )
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
            instance.failure_reason = "Could not queue provisioning task."
            db.add(
                CreditTransaction(
                    user_id=db_user.id,
                    delta=float(template.credits_cost),
                    reason=f"Refund: provisioning queue failure for {instance.id}",
                )
            )
            db.add(
                LabEvent(
                    instance_id=instance.id,
                    level="error",
                    phase="queued",
                    message="Failed to queue provisioning task; credits refunded.",
                    progress=0,
                )
            )
            await db.commit()
        except SQLAlchemyError:
            await db.rollback()
            logger.exception("Failed to compensate lab start after dispatch failure")
        raise HTTPException(status_code=503, detail="Could not queue lab provisioning")

    return {
        "instance_id": instance.id,
        "status": normalize_lab_status(instance.status),
        "progress": instance.progress,
        "status_message": instance.status_message,
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
    Active = queued, provisioning, starting, ready, or legacy running.
    """
    db_user = await _get_current_db_user(db, _claims_sub(user))

    try:
        result = await db.execute(
            select(LabInstance).where(
                LabInstance.user_id == db_user.id,
                LabInstance.status.in_(USER_VISIBLE_LAB_STATUSES),
            )
        )
        instances = result.scalars().all()
    except SQLAlchemyError:
        logger.exception("Database query failed while loading active labs")
        raise HTTPException(status_code=500, detail="Database query failed")

    template_ids = {instance.template_id for instance in instances}
    template_by_id: dict[str, LabTemplate] = {}
    if template_ids:
        try:
            template_result = await db.execute(
                select(LabTemplate).where(LabTemplate.id.in_(template_ids))
            )
            template_by_id = {
                template.id: template
                for template in template_result.scalars().all()
            }
        except SQLAlchemyError:
            logger.exception("Database query failed while loading active lab templates")
            raise HTTPException(status_code=500, detail="Database query failed")

    return [_serialize_instance(i, template_by_id.get(i.template_id)) for i in instances]


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

    try:
        result = await db.execute(
            select(LabTemplate).where(LabTemplate.id == instance.template_id)
        )
        template = result.scalar_one_or_none()
    except SQLAlchemyError:
        logger.exception("Database query failed while loading lab template for status")
        template = None

    return _serialize_instance(instance, template)


@router.get("/{instance_id}/events")
async def get_lab_events(
    instance_id: str = Path(..., pattern=INSTANCE_ID_PATTERN),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    db_user = await _get_current_db_user(db, _claims_sub(user))
    await _get_owned_instance(db, instance_id, db_user.id)

    try:
        result = await db.execute(
            select(LabEvent)
            .where(LabEvent.instance_id == instance_id)
            .order_by(LabEvent.created_at.desc())
            .limit(50)
        )
        events = list(reversed(result.scalars().all()))
    except SQLAlchemyError:
        logger.exception("Database query failed while loading lab events")
        raise HTTPException(status_code=500, detail="Database query failed")

    return [
        {
            "id": event.id,
            "level": event.level,
            "phase": event.phase,
            "message": event.message,
            "progress": event.progress,
            "created_at": event.created_at,
        }
        for event in events
    ]


@router.get("/{instance_id}/logs", response_model=LabLogsResponse)
async def get_lab_logs(
    instance_id: str = Path(..., pattern=INSTANCE_ID_PATTERN),
    limit: int = 100,
    next_token: str | None = None,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    db_user = await _get_current_db_user(db, _claims_sub(user))
    instance = await _get_owned_instance(db, instance_id, db_user.id)

    if not instance.ecs_log_group or not instance.ecs_log_stream_name:
        return {"events": [], "next_forward_token": None}

    try:
        return fetch_lab_logs(
            log_group=instance.ecs_log_group,
            log_stream_name=instance.ecs_log_stream_name,
            limit=limit,
            next_token=next_token,
        )
    except LabRuntimeAwsError:
        logger.exception("CloudWatch Logs failed while loading lab logs")
        raise HTTPException(status_code=502, detail="Could not load lab logs")


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

    current_status = normalize_lab_status(instance.status)
    if current_status not in STOPPABLE_LAB_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot stop a lab with status {instance.status}",
        )

    if current_status == LAB_STATUS_QUEUED and not instance.cfn_stack_name and not instance.secrets_key:
        instance.status = LAB_STATUS_STOPPED
        instance.progress = 100
        instance.status_message = "Stopped before provisioning began."
        instance.destroyed_at = datetime.now(timezone.utc)
        instance.last_status_at = datetime.now(timezone.utc)
        db.add(
            LabEvent(
                instance_id=instance.id,
                level="info",
                phase="stopped",
                message="Lab stopped before provisioning began.",
                progress=100,
            )
        )
        try:
            await db.commit()
        except SQLAlchemyError:
            await db.rollback()
            logger.exception("Database write failed while stopping queued lab")
            raise HTTPException(status_code=500, detail="Database write failed")

        return {
            "instance_id": instance.id,
            "status": LAB_STATUS_STOPPED,
            "message": "Lab stopped before provisioning began.",
        }

    instance.status = LAB_STATUS_DESTROYING
    instance.status_message = "Stop requested; teardown is queued."
    instance.last_status_at = datetime.now(timezone.utc)
    db.add(
        LabEvent(
            instance_id=instance.id,
            level="info",
            phase="destroying",
            message="User requested lab teardown.",
            progress=instance.progress,
        )
    )
    try:
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        logger.exception("Database write failed while marking lab for teardown")
        raise HTTPException(status_code=500, detail="Database write failed")

    try:
        # Dispatch Celery teardown task to SQS. Importing here keeps task
        # packaging or queue failures recoverable with a direct teardown
        # fallback so the user is not trapped by the active-lab quota.
        from workers.destroy import destroy_lab, destroy_lab_now

        destroy_lab.delay(
            instance_id=instance.id,
            cfn_stack_name=instance.cfn_stack_name or "",
            secrets_key=instance.secrets_key,
        )
    except Exception:
        logger.exception("Failed to dispatch teardown task; attempting direct teardown")
        try:
            destroy_lab_now(
                instance_id=instance.id,
                cfn_stack_name=instance.cfn_stack_name or "",
                secrets_key=instance.secrets_key,
            )
        except Exception:
            logger.exception("Direct teardown fallback failed")
            instance.failure_reason = "Could not queue or directly run lab teardown."
            instance.status_message = "Stop requested, but teardown dispatch failed. Admin cleanup required."
            db.add(
                LabEvent(
                    instance_id=instance.id,
                    level="error",
                    phase="destroying",
                    message="Could not queue or directly run lab teardown; cleanup required.",
                    progress=instance.progress,
                )
            )
            try:
                await db.commit()
            except SQLAlchemyError:
                await db.rollback()
                logger.exception("Failed to record teardown dispatch failure")
            raise HTTPException(status_code=503, detail="Could not queue lab teardown")
        try:
            await db.refresh(instance)
        except SQLAlchemyError:
            await db.rollback()
            logger.exception("Failed to refresh lab after direct teardown fallback")

    return {
        "instance_id": instance.id,
        "status": normalize_lab_status(instance.status),
        "message": "Lab is being destroyed.",
    }


@router.get("/{instance_id}/config")
async def get_lab_config(
    instance_id: str = Path(..., pattern=INSTANCE_ID_PATTERN),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Download runtime access config for a running lab owned by the user.
    Lab runtime is disabled in this build, but older rows may still reference
    Secrets Manager material.
    """
    db_user = await _get_current_db_user(db, _claims_sub(user))
    instance = await _get_owned_instance(db, instance_id, db_user.id)

    if normalize_lab_status(instance.status) != LAB_STATUS_READY:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot download config for a lab with status {instance.status}",
        )

    config = None
    if LAB_VPN_CONFIG_INLINE:
        config = LAB_VPN_CONFIG_INLINE
    elif LAB_VPN_CONFIG_SECRET_ID:
        config = _load_secret_string(LAB_VPN_CONFIG_SECRET_ID)

    if not config:
        raise HTTPException(
            status_code=503,
            detail=(
                "VPN config is not configured for the Fargate lab runtime. "
                "Set LAB_VPN_CONFIG_SECRET_ID or LAB_VPN_CONFIG_INLINE to a working shared WireGuard client config."
            ),
        )

    rendered_config = _render_vpn_config_template(config, instance)
    if not rendered_config.strip():
        raise HTTPException(status_code=404, detail="Runtime access config not found")

    return PlainTextResponse(
        rendered_config,
        headers={
            "Content-Disposition": (
                f"attachment; filename={_vpn_config_filename(instance_id)}"
            ),
        },
    )


@router.post("/{instance_id}/flag")
async def submit_flag(
    body: SubmitFlagRequest,
    instance_id: str = Path(..., pattern=INSTANCE_ID_PATTERN),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Validate a submitted lab flag and mark the instance complete.

    Stored template flags are SHA-256 hashes. Current custom Docker labs also
    receive ORCHESTRYX{instance_id} from the provisioning worker, so that
    dynamic value is accepted without saving the plain flag in the database.
    """
    db_user = await _get_current_db_user(db, _claims_sub(user))
    instance = await _get_owned_instance(db, instance_id, db_user.id)

    # Only running labs can be completed. This prevents users from submitting
    # flags against failed, destroyed, or still-provisioning sessions.
    if normalize_lab_status(instance.status) != LAB_STATUS_READY:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot submit a flag for a lab with status {instance.status}",
        )

    # Re-submitting an already accepted flag is idempotent for smoother UI
    # retries and page refreshes.
    if instance.flag_submitted:
        return {
            "correct": True,
            "flag_submitted": True,
            "message": "Flag already submitted.",
        }

    try:
        result = await db.execute(
            select(LabFlag).where(LabFlag.template_id == instance.template_id)
        )
        lab_flag = result.scalar_one_or_none()
    except SQLAlchemyError:
        logger.exception("Database query failed while loading lab flag")
        raise HTTPException(status_code=500, detail="Database query failed")

    # Incorrect submissions are normal user mistakes, so return 200 with a
    # clear result instead of treating them as API errors.
    if not _is_correct_flag(body.flag, instance, lab_flag):
        return {
            "correct": False,
            "flag_submitted": False,
            "message": "Incorrect flag.",
        }

    # Persist the completion marker on the lab instance. The status remains
    # READY so the student can keep using the environment until TTL/Stop Lab.
    instance.flag_submitted = True
    try:
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        logger.exception("Database write failed while submitting flag")
        raise HTTPException(status_code=500, detail="Database write failed")

    return {
        "correct": True,
        "flag_submitted": True,
        "message": "Flag accepted.",
    }
