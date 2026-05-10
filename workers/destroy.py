import logging
import time
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
from apps.api.services.lab_runtime_ecs import LabRuntimeAwsError, apply_task_snapshot, describe_task, stop_lab_task
from workers.celery_app import DESTROY_QUEUE, celery_app

logger = logging.getLogger(__name__)

STARTUP_STALE_STATUSES = ["QUEUED", "PROVISIONING", "STARTING"]
RUNTIME_ACTIVE_STATUSES = [LAB_STATUS_READY, "RUNNING"]

SYNC_DATABASE_URL = DATABASE_URL.replace("+asyncpg", "")
engine = create_engine(
    SYNC_DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
)
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


import json
import boto3

def _revoke_vpn_peer(secrets_key: str | None) -> None:
    if not secrets_key:
        return
    try:
        secrets = json.loads(secrets_key)
        client_pub_b64 = secrets.get("public_key")
        if not client_pub_b64:
            return
            
        from apps.api.config import AWS_REGION
        ec2_client = boto3.client("ec2", region_name=AWS_REGION)
        instances = ec2_client.describe_instances(
            Filters=[
                {"Name": "tag:Name", "Values": ["*WireGuardGateway/Instance*"]},
                {"Name": "instance-state-name", "Values": ["running"]}
            ]
        )
        if not instances.get("Reservations"):
            return
        vpn_instance_id = instances["Reservations"][0]["Instances"][0]["InstanceId"]
        
        ssm_client = boto3.client("ssm", region_name=AWS_REGION)
        cmd = f"wg set wg0 peer {client_pub_b64} remove"
        ssm_client.send_command(
            InstanceIds=[vpn_instance_id],
            DocumentName="AWS-RunShellScript",
            Parameters={"commands": [cmd]}
        )
    except Exception as e:
        logger.exception("Failed to revoke VPN peer")

def destroy_lab_now(instance_id: str, cfn_stack_name: str = "", secrets_key: str | None = None) -> None:
    """Stop the ECS Fargate task for a lab instance."""
    del cfn_stack_name

    logger.info("Stopping ECS lab task for %s", instance_id)
    try:
        with SessionLocal() as session:
            instance = session.get(LabInstance, instance_id)
            if instance is None:
                logger.error("Lab instance %s not found while tearing down", instance_id)
                return
            task_arn = instance.ecs_task_arn
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
                session.commit()
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
            
            _revoke_vpn_peer(instance.secrets_key or secrets_key)

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
            session.commit()
    except (SQLAlchemyError, LabRuntimeAwsError) as exc:
        logger.exception("Failed to tear down ECS lab %s", instance_id)
        raise RuntimeError("Could not tear down ECS lab") from exc


@celery_app.task(queue=DESTROY_QUEUE)
def destroy_lab(instance_id: str, cfn_stack_name: str = "", secrets_key: str | None = None) -> None:
    destroy_lab_now(instance_id=instance_id, cfn_stack_name=cfn_stack_name, secrets_key=secrets_key)
