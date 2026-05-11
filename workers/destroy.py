import json
import logging
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from apps.api.config import DATABASE_URL
from apps.api.models.credit_transaction import CreditTransaction
from apps.api.models.lab_access_rule import LabAccessRule
from apps.api.models.lab_instance import LabInstance
from apps.api.models.lab_template import LabTemplate
from apps.api.models.user import User
from apps.api.models.vpn_peer import VpnPeer
from apps.api.services.lab_lifecycle import (
    LAB_STATUS_DESTROYING,
    LAB_STATUS_EXPIRED,
    LAB_STATUS_FAILED,
    LAB_STATUS_READY,
    LAB_STATUS_STOPPED,
    set_lab_status,
)
from apps.api.services.lab_runtime_ecs import (
    LabRuntimeAwsError,
    apply_task_snapshot,
    delete_per_lab_security_group,
    describe_task,
    stop_lab_task,
)
from apps.api.services.vpn_gateway import VpnGatewayError, get_gateway_instance_id, revoke_vpn_peer
from workers.celery_app import DESTROY_QUEUE, celery_app

logger = logging.getLogger(__name__)

STARTUP_STALE_STATUSES = ["QUEUED", "PROVISIONING", "STARTING"]
RUNTIME_ACTIVE_STATUSES = [LAB_STATUS_READY, "RUNNING"]

SYNC_DATABASE_URL = DATABASE_URL.replace("+asyncpg", "")
engine = create_engine(SYNC_DATABASE_URL, pool_pre_ping=True, pool_recycle=300)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def _finish_stopped(instance_id: str, message: str = "Lab ECS task stopped.") -> None:
    with SessionLocal() as session:
        instance = session.get(LabInstance, instance_id)
        if instance is None:
            logger.error("Lab instance %s not found while finalizing teardown", instance_id)
            return
        set_lab_status(
            session,
            instance,
            status=LAB_STATUS_STOPPED,
            message=message,
            progress=100,
            phase="ecs-stopped",
        )
        instance.destroyed_at = datetime.now(timezone.utc)
        session.commit()


def _revoke_access_records(session, instance_id: str) -> None:
    """Mark VpnPeer and LabAccessRule rows as revoked for this instance."""
    now = datetime.now(timezone.utc)
    result = session.execute(
        select(LabAccessRule).where(
            LabAccessRule.instance_id == instance_id,
            LabAccessRule.status == "active",
        )
    )
    for rule in result.scalars().all():
        rule.status = "revoked"
        rule.revoked_at = now

    result = session.execute(
        select(VpnPeer).where(
            VpnPeer.instance_id == instance_id,
            VpnPeer.status == "active",
        )
    )
    for peer in result.scalars().all():
        peer.status = "revoked"
        peer.revoked_at = now


def _get_public_key(instance: LabInstance, session) -> str | None:
    """Return the WireGuard public key for this lab's VPN peer.

    Checks the VpnPeer record first (new path), falls back to secrets_key JSON
    (old labs that were provisioned before the Phase 1 migration).
    """
    peer_result = session.execute(
        select(VpnPeer).where(VpnPeer.instance_id == instance.id)
    )
    peer = peer_result.scalar_one_or_none()
    if peer is not None:
        return peer.public_key

    # Legacy path: secrets_key JSON contained public_key before VpnPeer existed.
    if instance.secrets_key:
        try:
            return json.loads(instance.secrets_key).get("public_key")
        except Exception:
            pass
    return None


@celery_app.task(queue=DESTROY_QUEUE)
def destroy_expired_labs() -> int:
    """Queue teardown for labs whose TTL has expired."""
    now = datetime.now(timezone.utc)
    expired_ids: list[str] = []

    try:
        with SessionLocal() as session:
            result = session.execute(
                select(LabInstance).where(
                    LabInstance.status.in_(RUNTIME_ACTIVE_STATUSES),
                    LabInstance.expires_at.is_not(None),
                    LabInstance.expires_at <= now,
                )
            )
            for instance in result.scalars().all():
                set_lab_status(
                    session,
                    instance,
                    status=LAB_STATUS_EXPIRED,
                    message="Lab TTL expired; ECS teardown is queued.",
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
        destroy_lab.delay(instance_id=instance_id)

    return len(expired_ids)


@celery_app.task(queue=DESTROY_QUEUE)
def poll_active_lab_tasks() -> int:
    """Refresh active lab rows from ECS task state."""
    updated_count = 0
    try:
        with SessionLocal() as session:
            result = session.execute(
                select(LabInstance).where(
                    LabInstance.ecs_task_arn.is_not(None),
                    LabInstance.status.in_(["PROVISIONING", "STARTING", LAB_STATUS_READY, LAB_STATUS_DESTROYING]),
                )
            )
            instances = result.scalars().all()

        for instance in instances:
            snapshot = describe_task(instance.ecs_task_arn)
            with SessionLocal() as session:
                current = session.get(LabInstance, instance.id)
                if current is None:
                    continue
                if snapshot is None:
                    if current.status == LAB_STATUS_DESTROYING:
                        set_lab_status(
                            session,
                            current,
                            status=LAB_STATUS_STOPPED,
                            message="Lab ECS task was absent during sync; marking stopped.",
                            progress=100,
                            phase="ecs-stopped",
                        )
                        current.destroyed_at = datetime.now(timezone.utc)
                        session.commit()
                        updated_count += 1
                    continue
                apply_task_snapshot(current, snapshot)
                if snapshot.last_status == "STOPPED" and current.status != LAB_STATUS_STOPPED:
                    set_lab_status(
                        session,
                        current,
                        status=LAB_STATUS_STOPPED,
                        message=snapshot.stopped_reason or "Lab ECS task stopped.",
                        progress=100,
                        phase="ecs-stopped",
                    )
                    current.destroyed_at = datetime.now(timezone.utc)
                session.commit()
                updated_count += 1
    except (SQLAlchemyError, LabRuntimeAwsError) as exc:
        logger.exception("Failed while polling active ECS lab tasks")
        raise RuntimeError("Could not poll active lab tasks") from exc

    return updated_count


@celery_app.task(queue=DESTROY_QUEUE)
def fail_stale_provisioning_labs(timeout_seconds: int = 1200) -> int:
    """Fail stuck lab starts and refund credits."""
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
                if instance.ecs_task_arn:
                    try:
                        stop_lab_task(instance.ecs_task_arn, "Stale lab provisioning timeout")
                    except LabRuntimeAwsError:
                        logger.exception("Could not stop stale ECS task for %s", instance.id)
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


def destroy_lab_now(
    instance_id: str,
    cfn_stack_name: str = "",
    secrets_key: str | None = None,
) -> None:
    """Stop the ECS Fargate task for a lab instance and clean up all associated resources."""
    del cfn_stack_name  # legacy parameter, unused

    logger.info("Stopping ECS lab task for %s", instance_id)
    try:
        with SessionLocal() as session:
            instance = session.get(LabInstance, instance_id)
            if instance is None:
                logger.error("Lab instance %s not found while tearing down", instance_id)
                return

            task_arn = instance.ecs_task_arn
            per_lab_sg_id = instance.ecs_security_group_id
            public_key = _get_public_key(instance, session)

            if not task_arn:
                set_lab_status(
                    session,
                    instance,
                    status=LAB_STATUS_STOPPED,
                    message="Lab stopped before an ECS task was launched.",
                    progress=100,
                    phase="stopped",
                )
                instance.destroyed_at = datetime.now(timezone.utc)
                _revoke_access_records(session, instance_id)
                session.commit()
                if per_lab_sg_id:
                    delete_per_lab_security_group(per_lab_sg_id)
                return

            set_lab_status(
                session,
                instance,
                status=LAB_STATUS_DESTROYING,
                message="Stopping ECS Fargate lab task.",
                progress=instance.progress,
                phase="ecs-stop-task",
            )
            session.commit()

        # Revoke VPN peer (SSM with wait). Logs on failure — does not block destroy.
        if public_key:
            try:
                gateway_id = get_gateway_instance_id()
                revoke_vpn_peer(gateway_id, public_key)
            except (VpnGatewayError, LabRuntimeAwsError):
                logger.exception(
                    "VPN peer revocation failed for lab %s; continuing with ECS stop",
                    instance_id,
                )
        else:
            logger.warning("No public key found for lab %s; skipping VPN revocation", instance_id)

        # Stop the ECS task and wait for it.
        snapshot = stop_lab_task(task_arn, "Orchestryx lab teardown requested")
        deadline = time.monotonic() + 120
        while snapshot is not None and snapshot.last_status != "STOPPED" and time.monotonic() < deadline:
            time.sleep(3)
            snapshot = describe_task(task_arn)

        with SessionLocal() as session:
            instance = session.get(LabInstance, instance_id)
            if instance is None:
                return
            if snapshot is not None:
                apply_task_snapshot(instance, snapshot)
            final_message = (
                snapshot.stopped_reason
                if snapshot is not None and snapshot.stopped_reason
                else "Lab ECS task stopped."
            )
            set_lab_status(
                session,
                instance,
                status=LAB_STATUS_STOPPED,
                message=final_message,
                progress=100,
                phase="ecs-stopped",
            )
            instance.destroyed_at = datetime.now(timezone.utc)
            _revoke_access_records(session, instance_id)
            session.commit()

        # Delete the per-lab security group after ECS task is stopped.
        # Do this last so the SG is not deleted while the task ENI may still reference it.
        if per_lab_sg_id:
            delete_per_lab_security_group(per_lab_sg_id)

    except (SQLAlchemyError, LabRuntimeAwsError) as exc:
        logger.exception("Failed to tear down ECS lab %s", instance_id)
        raise RuntimeError("Could not tear down ECS lab") from exc


@celery_app.task(queue=DESTROY_QUEUE)
def destroy_lab(
    instance_id: str,
    cfn_stack_name: str = "",
    secrets_key: str | None = None,
) -> None:
    destroy_lab_now(
        instance_id=instance_id,
        cfn_stack_name=cfn_stack_name,
        secrets_key=secrets_key,
    )
