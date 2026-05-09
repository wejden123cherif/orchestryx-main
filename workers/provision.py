import logging

from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from apps.api.config import DATABASE_URL
from apps.api.models.credit_transaction import CreditTransaction
from apps.api.models.lab_instance import LabInstance
from apps.api.models.lab_template import LabTemplate
from apps.api.models.user import User
from apps.api.services.lab_lifecycle import LAB_STATUS_FAILED, set_lab_status
from workers.celery_app import PROVISION_QUEUE, celery_app

logger = logging.getLogger(__name__)

SYNC_DATABASE_URL = DATABASE_URL.replace("+asyncpg", "")
engine = create_engine(
    SYNC_DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

DISABLED_RUNTIME_REASON = (
    "Lab runtime is disabled. Orchestryx platform deployment is active, "
    "but lab provisioning is not implemented in this build."
)


@celery_app.task(queue=PROVISION_QUEUE)
def provision_lab(instance_id: str, template_id: str, user_id: str) -> None:
    """Fail queued lab work predictably while lab runtime is disabled.

    The old per-lab EC2 CDK app has been removed. This task intentionally does
    not shell out to CDK, generate WireGuard keys, or create per-lab resources.
    It remains importable so stale messages or older API code paths produce a
    controlled database state instead of worker import failures.
    """
    logger.warning("Rejecting lab provisioning for %s: runtime disabled", instance_id)

    try:
        with SessionLocal() as session:
            instance = session.get(LabInstance, instance_id)
            if instance is None:
                logger.error("Lab instance %s not found while marking disabled runtime", instance_id)
                return

            template = session.get(LabTemplate, template_id)
            user = session.get(User, user_id)

            already_failed = instance.status == LAB_STATUS_FAILED
            set_lab_status(
                session,
                instance,
                status=LAB_STATUS_FAILED,
                message="Lab runtime is disabled; no resources were provisioned.",
                progress=100,
                level="error",
                phase="runtime-disabled",
                failure_reason=DISABLED_RUNTIME_REASON,
            )

            if not already_failed and template is not None and user is not None:
                user.credits_balance += float(template.credits_cost)
                session.add(
                    CreditTransaction(
                        user_id=user_id,
                        delta=float(template.credits_cost),
                        reason=f"Refund: lab runtime disabled for {template_id} ({instance_id})",
                    )
                )

            session.commit()
    except SQLAlchemyError as exc:
        logger.exception("Database write failed while rejecting disabled lab runtime")
        raise RuntimeError("Could not mark disabled lab runtime") from exc
