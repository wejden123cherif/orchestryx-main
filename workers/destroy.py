import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from apps.api.config import DATABASE_URL
from apps.api.models.credit_transaction import CreditTransaction
from apps.api.models.lab_instance import LabInstance
from apps.api.models.lab_template import LabTemplate
from apps.api.models.user import User
from apps.api.services.lab_lifecycle import (
    LAB_STATUS_DESTROYING,
    LAB_STATUS_EXPIRED,
    LAB_STATUS_FAILED,
    LAB_STATUS_READY,
    LAB_STATUS_STOPPED,
    set_lab_status,
)
from workers.celery_app import DESTROY_QUEUE, celery_app

logger = logging.getLogger(__name__)

LAB_STATUS_RUNNING = "RUNNING"
STARTUP_STALE_STATUSES = ["QUEUED", "PROVISIONING", "STARTING"]

SYNC_DATABASE_URL = DATABASE_URL.replace("+asyncpg", "")
engine = create_engine(
    SYNC_DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def _mark_destroyed(instance_id: str, message: str = "Lab runtime is disabled; no resources were destroyed.") -> None:
    try:
        with SessionLocal() as session:
            instance = session.get(LabInstance, instance_id)
            if instance is None:
                logger.error("Lab instance %s not found while finalizing teardown", instance_id)
                return

            final_status = LAB_STATUS_FAILED if instance.status == LAB_STATUS_FAILED else LAB_STATUS_STOPPED
            set_lab_status(
                session,
                instance,
                status=final_status,
                message=message,
                progress=100,
                phase="runtime-disabled-cleanup",
            )
            instance.destroyed_at = datetime.now(timezone.utc)
            session.commit()
    except SQLAlchemyError as exc:
        logger.exception("Database write failed while finalizing disabled lab teardown")
        raise RuntimeError("Could not finalize lab teardown") from exc


@celery_app.task(queue=DESTROY_QUEUE)
def destroy_expired_labs() -> int:
    """Stop expired labs in the database while lab infrastructure is disabled."""
    now = datetime.now(timezone.utc)
    expired_ids: list[str] = []

    try:
        with SessionLocal() as session:
            result = session.execute(
                select(LabInstance).where(
                    LabInstance.status.in_([LAB_STATUS_READY, LAB_STATUS_RUNNING]),
                    LabInstance.expires_at.is_not(None),
                    LabInstance.expires_at <= now,
                )
            )
            for instance in result.scalars().all():
                set_lab_status(
                    session,
                    instance,
                    status=LAB_STATUS_EXPIRED,
                    message="Lab TTL expired; runtime cleanup is disabled.",
                    progress=instance.progress,
                    level="warning",
                    phase="expired",
                )
                instance.status = LAB_STATUS_DESTROYING
                expired_ids.append(instance.id)
            session.commit()
    except SQLAlchemyError as exc:
        logger.exception("Database query failed while finding expired labs")
        raise RuntimeError("Could not find expired labs") from exc

    for instance_id in expired_ids:
        destroy_lab.delay(instance_id=instance_id, cfn_stack_name="", secrets_key=None)

    return len(expired_ids)


@celery_app.task(queue=DESTROY_QUEUE)
def fail_stale_provisioning_labs(timeout_seconds: int = 1200) -> int:
    """Fail stuck lab starts and refund credits while lab runtime is disabled."""
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=timeout_seconds)
    failed_count = 0

    try:
        with SessionLocal() as session:
            result = session.execute(
                select(LabInstance).where(
                    LabInstance.status.in_(STARTUP_STALE_STATUSES),
                    LabInstance.started_at <= cutoff,
                )
            )
            for instance in result.scalars().all():
                template = session.get(LabTemplate, instance.template_id)
                user = session.get(User, instance.user_id)
                set_lab_status(
                    session,
                    instance,
                    status=LAB_STATUS_FAILED,
                    message="Provisioning timed out. Credits were refunded.",
                    progress=100,
                    level="error",
                    phase="timeout",
                    failure_reason="Provisioning exceeded the configured timeout.",
                )
                if template is not None and user is not None:
                    user.credits_balance += float(template.credits_cost)
                    session.add(
                        CreditTransaction(
                            user_id=user.id,
                            delta=float(template.credits_cost),
                            reason=f"Refund: stale provisioning timeout for {instance.id}",
                        )
                    )
                failed_count += 1
            session.commit()
    except SQLAlchemyError as exc:
        logger.exception("Database query failed while failing stale provisioning labs")
        raise RuntimeError("Could not fail stale provisioning labs") from exc

    return failed_count


@celery_app.task(queue=DESTROY_QUEUE)
def destroy_lab(instance_id: str, cfn_stack_name: str = "", secrets_key: str | None = None) -> None:
    """Mark a lab stopped without invoking the removed per-lab CDK runtime."""
    logger.warning(
        "Completing teardown for %s without CDK destroy; lab runtime is disabled",
        instance_id,
    )
    _mark_destroyed(instance_id)
