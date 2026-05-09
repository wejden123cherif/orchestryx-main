import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, StringConstraints
from sqlalchemy import case, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.database import get_db
from apps.api.middleware.auth import get_current_user
from apps.api.models.credit_transaction import CreditTransaction
from apps.api.models.lab_event import LabEvent
from apps.api.models.lab_instance import LabInstance
from apps.api.models.lab_template import LabTemplate
from apps.api.models.user import User
from apps.api.services.aws_monitoring import get_aws_overview, get_recent_logs
from apps.api.services.lab_lifecycle import (
    ACTIVE_LAB_STATUSES,
    LAB_STATUS_DESTROYING,
    LAB_STATUS_FAILED,
    LAB_STATUS_READY,
    normalize_lab_status,
)

router = APIRouter(prefix="/admin", tags=["admin"])
logger = logging.getLogger(__name__)

USER_ID_PATTERN = (
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-"
    r"[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
)
INSTANCE_ID_PATTERN = USER_ID_PATTERN


class CreditAdjustmentRequest(BaseModel):
    delta: float
    reason: Annotated[str, StringConstraints(min_length=3, max_length=240)]


class UserUpdateRequest(BaseModel):
    role: Annotated[str, StringConstraints(pattern=r"^(user|admin)$")] | None = None
    is_disabled: bool | None = None
    max_active_labs: int | None = None


class LabExtendRequest(BaseModel):
    hours: int


INSTANCE_HOURLY_ESTIMATES = {
    "t3.nano": 0.0052,
    "t3.micro": 0.0104,
    "t3.small": 0.0208,
    "t3.medium": 0.0416,
    "t3.large": 0.0832,
    "t4g.nano": 0.0042,
    "t4g.micro": 0.0084,
    "t4g.small": 0.0168,
    "t4g.medium": 0.0336,
}


def _coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _runtime_hours(started_at: datetime | None, ended_at: datetime | None = None) -> float:
    started = _coerce_utc(started_at)
    if started is None:
        return 0
    ended = _coerce_utc(ended_at) or datetime.now(timezone.utc)
    return max(0, round((ended - started).total_seconds() / 3600, 2))


def _estimated_lab_cost(instance_type: str | None, started_at: datetime | None, ended_at: datetime | None = None) -> float | None:
    hourly = INSTANCE_HOURLY_ESTIMATES.get(instance_type or "")
    if hourly is None:
        return None
    return round(hourly * _runtime_hours(started_at, ended_at), 2)


async def require_admin(
    claims=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    cognito_sub = claims.get("sub")
    groups = claims.get("cognito:groups") or []
    if isinstance(groups, str):
        groups = [groups]

    try:
        result = await db.execute(select(User).where(User.cognito_sub == cognito_sub))
        db_user = result.scalar_one_or_none()
    except SQLAlchemyError:
        logger.exception("Database query failed while checking admin access")
        raise HTTPException(status_code=500, detail="Database query failed")

    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if db_user.role != "admin" and "admin" not in groups:
        raise HTTPException(status_code=403, detail="Admin access required")

    return db_user


@router.get("/overview")
async def get_admin_overview(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        counts_result = await db.execute(
            select(LabInstance.status, func.count()).group_by(LabInstance.status)
        )
        status_counts: dict[str, int] = {}
        for status, count in counts_result.all():
            normalized = normalize_lab_status(status)
            status_counts[normalized] = status_counts.get(normalized, 0) + int(count)
        users_count = int((await db.execute(select(func.count()).select_from(User))).scalar_one())
        credit_sum = float(
            (await db.execute(select(func.coalesce(func.sum(User.credits_balance), 0)))).scalar_one()
        )
        queued_oldest = (
            await db.execute(
                select(func.min(LabInstance.started_at)).where(
                    LabInstance.status.in_(["QUEUED", "PROVISIONING", "STARTING"])
                )
            )
        ).scalar_one_or_none()
    except SQLAlchemyError:
        logger.exception("Database query failed while loading admin overview")
        raise HTTPException(status_code=500, detail="Database query failed")

    now = datetime.now(timezone.utc)
    oldest_queue_age_seconds = None
    if queued_oldest is not None:
        if queued_oldest.tzinfo is None:
            queued_oldest = queued_oldest.replace(tzinfo=timezone.utc)
        oldest_queue_age_seconds = int((now - queued_oldest).total_seconds())

    return {
        "labs": {
            "active": sum(status_counts.get(status, 0) for status in ACTIVE_LAB_STATUSES),
            "queued": status_counts.get("QUEUED", 0),
            "provisioning": status_counts.get("PROVISIONING", 0),
            "starting": status_counts.get("STARTING", 0),
            "ready": status_counts.get(LAB_STATUS_READY, 0),
            "failed": status_counts.get(LAB_STATUS_FAILED, 0),
            "all_statuses": status_counts,
            "oldest_queue_age_seconds": oldest_queue_age_seconds,
        },
        "users": {"total": users_count},
        "credits": {"outstanding_balance": credit_sum},
        "system": {
            "database": "ok",
            "stale_queue_warning": bool(oldest_queue_age_seconds and oldest_queue_age_seconds > 900),
        },
    }


@router.get("/users")
async def list_users(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await db.execute(select(User).order_by(User.created_at.desc()).limit(200))
        users = result.scalars().all()
        lab_stats_result = await db.execute(
            select(
                LabInstance.user_id,
                func.count().label("total_labs"),
                func.sum(case((LabInstance.status.in_(list(ACTIVE_LAB_STATUSES)), 1), else_=0)).label("active_labs"),
            ).group_by(LabInstance.user_id)
        )
        lab_stats = {
            row.user_id: {
                "total_labs": int(row.total_labs or 0),
                "active_labs": int(row.active_labs or 0),
            }
            for row in lab_stats_result
        }
    except SQLAlchemyError:
        logger.exception("Database query failed while loading users")
        raise HTTPException(status_code=500, detail="Database query failed")

    return [
        {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "is_disabled": user.is_disabled,
            "credits_balance": user.credits_balance,
            "subscription_tier": user.subscription_tier,
            "max_active_labs": user.max_active_labs,
            "created_at": user.created_at,
            "active_labs": lab_stats.get(user.id, {}).get("active_labs", 0),
            "total_labs": lab_stats.get(user.id, {}).get("total_labs", 0),
        }
        for user in users
    ]


@router.patch("/users/{user_id}")
async def update_user(
    body: UserUpdateRequest,
    user_id: str = Path(..., pattern=USER_ID_PATTERN),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    db_user = await db.get(User, user_id)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if body.role is not None:
        db_user.role = body.role
    if body.is_disabled is not None:
        db_user.is_disabled = body.is_disabled
    if body.max_active_labs is not None:
        if body.max_active_labs < 0 or body.max_active_labs > 50:
            raise HTTPException(status_code=400, detail="max_active_labs must be between 0 and 50")
        db_user.max_active_labs = body.max_active_labs

    try:
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        logger.exception("Database write failed while updating user")
        raise HTTPException(status_code=500, detail="Database write failed")

    return {"id": db_user.id, "role": db_user.role, "is_disabled": db_user.is_disabled}


@router.post("/users/{user_id}/credits")
async def adjust_user_credits(
    body: CreditAdjustmentRequest,
    user_id: str = Path(..., pattern=USER_ID_PATTERN),
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    db_user = await db.get(User, user_id)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if body.delta == 0:
        raise HTTPException(status_code=400, detail="Credit delta cannot be zero")
    if db_user.credits_balance + body.delta < 0:
        raise HTTPException(status_code=400, detail="Credit adjustment would make balance negative")

    db_user.credits_balance += body.delta
    db.add(
        CreditTransaction(
            user_id=user_id,
            delta=body.delta,
            reason=f"Admin adjustment by {admin_user.email}: {body.reason}",
        )
    )

    try:
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        logger.exception("Database write failed while adjusting credits")
        raise HTTPException(status_code=500, detail="Database write failed")

    return {"user_id": user_id, "credits_balance": db_user.credits_balance}


@router.get("/credits")
async def list_credit_transactions(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await db.execute(
            select(CreditTransaction).order_by(CreditTransaction.created_at.desc()).limit(200)
        )
        rows = result.scalars().all()
    except SQLAlchemyError:
        logger.exception("Database query failed while loading credit transactions")
        raise HTTPException(status_code=500, detail="Database query failed")

    return [
        {
            "id": row.id,
            "user_id": row.user_id,
            "delta": row.delta,
            "reason": row.reason,
            "created_at": row.created_at,
        }
        for row in rows
    ]


@router.get("/labs")
async def list_labs(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await db.execute(
            select(LabInstance, LabTemplate, User)
            .join(LabTemplate, LabTemplate.id == LabInstance.template_id)
            .join(User, User.id == LabInstance.user_id)
            .order_by(LabInstance.started_at.desc())
            .limit(200)
        )
        rows = result.all()
    except SQLAlchemyError:
        logger.exception("Database query failed while loading labs")
        raise HTTPException(status_code=500, detail="Database query failed")

    return [
        {
            "instance_id": lab.id,
            "template_id": lab.template_id,
            "template_title": template.title,
            "owner_email": owner.email,
            "owner_id": owner.id,
            "status": normalize_lab_status(lab.status),
            "progress": lab.progress,
            "status_message": lab.status_message,
            "failure_reason": lab.failure_reason,
            "retry_count": lab.retry_count,
            "cfn_stack_name": lab.cfn_stack_name,
            "ec2_public_ip": lab.ec2_public_ip,
            "instance_type": template.instance_type,
            "credits_cost": template.credits_cost,
            "ttl_hours": template.ttl_hours,
            "runtime_hours": _runtime_hours(lab.started_at, lab.destroyed_at),
            "estimated_aws_cost": _estimated_lab_cost(template.instance_type, lab.started_at, lab.destroyed_at),
            "expires_at": lab.expires_at,
            "started_at": lab.started_at,
            "provisioning_started_at": lab.provisioning_started_at,
            "ready_at": lab.ready_at,
            "last_status_at": lab.last_status_at,
            "destroyed_at": lab.destroyed_at,
            "cleanup_required": normalize_lab_status(lab.status) in [LAB_STATUS_FAILED, "DESTROYING"]
            and not lab.destroyed_at,
        }
        for lab, template, owner in rows
    ]


@router.post("/labs/{instance_id}/stop")
async def admin_stop_lab(
    instance_id: str = Path(..., pattern=INSTANCE_ID_PATTERN),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    lab = await db.get(LabInstance, instance_id)
    if lab is None:
        raise HTTPException(status_code=404, detail="Lab not found")
    if normalize_lab_status(lab.status) not in [*ACTIVE_LAB_STATUSES, "DESTROYING"]:
        raise HTTPException(status_code=400, detail=f"Cannot stop lab with status {lab.status}")

    lab.status = LAB_STATUS_DESTROYING
    lab.status_message = "Admin requested teardown."
    db.add(
        LabEvent(
            instance_id=lab.id,
            level="warning",
            phase="destroying",
            message="Admin requested lab teardown.",
            progress=lab.progress,
        )
    )
    try:
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        logger.exception("Database write failed while marking lab for admin teardown")
        raise HTTPException(status_code=500, detail="Database write failed")

    from workers.destroy import destroy_lab

    destroy_lab.delay(
        instance_id=lab.id,
        cfn_stack_name=lab.cfn_stack_name or "",
        secrets_key=lab.secrets_key,
    )
    return {"instance_id": lab.id, "status": LAB_STATUS_DESTROYING}


@router.post("/labs/{instance_id}/extend-ttl")
async def admin_extend_lab_ttl(
    body: LabExtendRequest,
    instance_id: str = Path(..., pattern=INSTANCE_ID_PATTERN),
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if body.hours < 1 or body.hours > 24:
        raise HTTPException(status_code=400, detail="TTL extension must be between 1 and 24 hours")

    lab = await db.get(LabInstance, instance_id)
    if lab is None:
        raise HTTPException(status_code=404, detail="Lab not found")
    if normalize_lab_status(lab.status) not in ACTIVE_LAB_STATUSES:
        raise HTTPException(status_code=400, detail=f"Cannot extend TTL for lab with status {lab.status}")

    base = _coerce_utc(lab.expires_at) or datetime.now(timezone.utc)
    lab.expires_at = base + timedelta(hours=body.hours)
    lab.last_status_at = datetime.now(timezone.utc)
    db.add(
        LabEvent(
            instance_id=lab.id,
            level="warning",
            phase="ttl-extended",
            message=f"{admin_user.email} extended lab TTL by {body.hours} hour(s).",
            progress=lab.progress,
        )
    )
    try:
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        logger.exception("Database write failed while extending lab TTL")
        raise HTTPException(status_code=500, detail="Database write failed")

    return {"instance_id": lab.id, "expires_at": lab.expires_at}


@router.get("/provisioning/jobs")
async def list_provisioning_jobs(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await db.execute(
            select(LabInstance, LabTemplate, User)
            .join(LabTemplate, LabTemplate.id == LabInstance.template_id)
            .join(User, User.id == LabInstance.user_id)
            .order_by(LabInstance.started_at.desc())
            .limit(200)
        )
        rows = result.all()
    except SQLAlchemyError:
        logger.exception("Database query failed while loading provisioning jobs")
        raise HTTPException(status_code=500, detail="Database query failed")

    jobs = []
    for lab, template, owner in rows:
        status = normalize_lab_status(lab.status)
        started = _coerce_utc(lab.provisioning_started_at) or _coerce_utc(lab.started_at)
        finished = _coerce_utc(lab.ready_at) or _coerce_utc(lab.destroyed_at)
        current_duration = _runtime_hours(started, finished)
        jobs.append(
            {
                "id": lab.id,
                "lab_id": lab.id,
                "template_title": template.title,
                "owner_email": owner.email,
                "owner_id": owner.id,
                "status": status,
                "current_step": lab.status_message,
                "progress": lab.progress,
                "error": lab.failure_reason,
                "retries": lab.retry_count,
                "started_at": lab.started_at,
                "provisioning_started_at": lab.provisioning_started_at,
                "finished_at": lab.ready_at or lab.destroyed_at,
                "duration_hours": current_duration,
                "resource_ids": {
                    "cloudformation_stack": lab.cfn_stack_name,
                    "public_ip": lab.ec2_public_ip,
                    "secrets_key": lab.secrets_key,
                },
                "cleanup_status": "required" if status in [LAB_STATUS_FAILED, LAB_STATUS_DESTROYING] and not lab.destroyed_at else "clean",
                "is_slow": status in ["QUEUED", "PROVISIONING", "STARTING"] and current_duration > 0.25,
            }
        )
    return jobs


@router.get("/events")
async def list_lab_events(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    cutoff = datetime.now(timezone.utc) - timedelta(days=14)
    try:
        result = await db.execute(
            select(LabEvent)
            .where(LabEvent.created_at >= cutoff)
            .order_by(LabEvent.created_at.desc())
            .limit(300)
        )
        events = result.scalars().all()
    except SQLAlchemyError:
        logger.exception("Database query failed while loading lab events")
        raise HTTPException(status_code=500, detail="Database query failed")

    return [
        {
            "id": event.id,
            "instance_id": event.instance_id,
            "level": event.level,
            "phase": event.phase,
            "message": event.message,
            "progress": event.progress,
            "created_at": event.created_at,
        }
        for event in events
    ]


@router.get("/aws/overview")
async def admin_aws_overview(
    _: User = Depends(require_admin),
):
    return get_aws_overview()


@router.get("/aws/logs/{service}", response_class=PlainTextResponse)
async def admin_aws_logs(
    service: str,
    _: User = Depends(require_admin),
):
    try:
        return get_recent_logs(service)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
