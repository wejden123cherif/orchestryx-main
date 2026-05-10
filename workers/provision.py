import base64
import hashlib
import json
import logging
import time

import boto3
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from apps.api.config import DATABASE_URL, LAB_ECS_CLUSTER, LAB_PROVISION_TIMEOUT_SECONDS
from apps.api.models.credit_transaction import CreditTransaction
from apps.api.models.lab_instance import LabInstance
from apps.api.models.lab_template import LabTemplate
from apps.api.models.user import User
from apps.api.services.lab_lifecycle import (
    LAB_STATUS_FAILED,
    LAB_STATUS_PROVISIONING,
    LAB_STATUS_READY,
    LAB_STATUS_STARTING,
    set_lab_status,
)
from apps.api.services.lab_runtime_ecs import (
    LabRuntimeAwsError,
    LabRuntimeConfigError,
    apply_task_snapshot,
    describe_task,
    register_lab_task_definition,
    run_lab_task,
)
from workers.celery_app import PROVISION_QUEUE, celery_app

logger = logging.getLogger(__name__)

SYNC_DATABASE_URL = DATABASE_URL.replace("+asyncpg", "")
engine = create_engine(
    SYNC_DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def _refund_credits(session, instance: LabInstance, template: LabTemplate | None, user: User | None) -> None:
    if template is None or user is None:
        return
    user.credits_balance += float(template.credits_cost)
    session.add(
        CreditTransaction(
            user_id=user.id,
            delta=float(template.credits_cost),
            reason=f"Refund: lab provisioning failed for {template.id} ({instance.id})",
        )
    )


def _mark_failed(
    *,
    instance_id: str,
    template_id: str,
    user_id: str,
    message: str,
    failure_reason: str,
) -> None:
    with SessionLocal() as session:
        instance = session.get(LabInstance, instance_id)
        if instance is None:
            logger.error("Lab instance %s not found while marking failure", instance_id)
            return
        template = session.get(LabTemplate, template_id)
        user = session.get(User, user_id)
        already_failed = instance.status == LAB_STATUS_FAILED
        set_lab_status(
            session,
            instance,
            status=LAB_STATUS_FAILED,
            message=message,
            progress=100,
            level="error",
            phase="ecs-failed",
            failure_reason=failure_reason,
        )
        if not already_failed:
            _refund_credits(session, instance, template, user)
        session.commit()


def _register_vpn_peer(instance_id: str) -> str:
    private_key = X25519PrivateKey.generate()
    private_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption()
    )
    public_bytes = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw
    )
    client_priv_b64 = base64.b64encode(private_bytes).decode('ascii')
    client_pub_b64 = base64.b64encode(public_bytes).decode('ascii')

    h = hashlib.sha256(instance_id.encode()).digest()
    oct3 = int(h[0])
    oct4 = (int(h[1]) % 253) + 2
    client_ip = f"10.8.{oct3}.{oct4}"

    from apps.api.config import AWS_REGION
    ec2_client = boto3.client("ec2", region_name=AWS_REGION)
    instances = ec2_client.describe_instances(
        Filters=[
            {"Name": "tag:Name", "Values": ["*WireGuardGateway/Instance*"]},
            {"Name": "instance-state-name", "Values": ["running"]}
        ]
    )
    if not instances.get("Reservations"):
        raise RuntimeError("No running WireGuard Gateway found to register peer")
    vpn_instance_id = instances["Reservations"][0]["Instances"][0]["InstanceId"]

    ssm_client = boto3.client("ssm", region_name=AWS_REGION)
    cmd = f"wg set wg0 peer {client_pub_b64} allowed-ips {client_ip}/32"
    
    ssm_client.send_command(
        InstanceIds=[vpn_instance_id],
        DocumentName="AWS-RunShellScript",
        Parameters={"commands": [cmd]}
    )
    
    return json.dumps({
        "private_key": client_priv_b64,
        "public_key": client_pub_b64,
        "client_ip": client_ip,
        "peer_added": True
    })


@celery_app.task(queue=PROVISION_QUEUE)
def provision_lab(instance_id: str, template_id: str, user_id: str) -> None:
    """Launch one lab as an isolated ECS Fargate task.

    This replaces the removed per-lab CDK/EC2 path. Runtime work happens through
    boto3 only: register a task definition for the template image, run one task
    in the shared cluster/subnets/security group, poll until RUNNING, then store
    ECS/log/network metadata on the existing lab instance row.
    """
    logger.info("Starting ECS Fargate lab provisioning for %s", instance_id)

    try:
        with SessionLocal() as session:
            instance = session.get(LabInstance, instance_id)
            template = session.get(LabTemplate, template_id)
            if instance is None or template is None:
                logger.error(
                    "Cannot provision lab %s: instance=%s template=%s",
                    instance_id,
                    bool(instance),
                    bool(template),
                )
                return

            set_lab_status(
                session,
                instance,
                status=LAB_STATUS_PROVISIONING,
                message="Preparing ECS Fargate task definition.",
                progress=20,
                phase="ecs-task-definition",
            )
            session.commit()

            task_definition_arn, container_name = register_lab_task_definition(template)
            instance.ecs_cluster_name = LAB_ECS_CLUSTER
            instance.ecs_task_definition_arn = task_definition_arn
            instance.ecs_container_name = container_name
            set_lab_status(
                session,
                instance,
                status=LAB_STATUS_STARTING,
                message="Launching lab container on ECS Fargate.",
                progress=45,
                phase="ecs-run-task",
            )
            session.commit()

            task_arn = run_lab_task(
                instance=instance,
                template=template,
                task_definition_arn=task_definition_arn,
            )
            instance.ecs_task_arn = task_arn
            session.commit()

        deadline = time.monotonic() + LAB_PROVISION_TIMEOUT_SECONDS
        snapshot = None
        while time.monotonic() < deadline:
            snapshot = describe_task(task_arn)
            if snapshot is None:
                time.sleep(2)
                continue
            with SessionLocal() as session:
                instance = session.get(LabInstance, instance_id)
                if instance is None:
                    logger.error("Lab instance %s disappeared while polling ECS", instance_id)
                    return
                apply_task_snapshot(instance, snapshot)
                set_lab_status(
                    session,
                    instance,
                    status=LAB_STATUS_STARTING,
                    message=f"ECS task is {snapshot.last_status or 'starting'}.",
                    progress=70,
                    phase="ecs-poll",
                )
                session.commit()

            if snapshot.last_status == "RUNNING":
                break
            if snapshot.last_status == "STOPPED":
                raise LabRuntimeAwsError(snapshot.stopped_reason or "ECS task stopped before becoming ready")
            time.sleep(3)
        else:
            raise LabRuntimeAwsError("Timed out waiting for ECS task to reach RUNNING")

        with SessionLocal() as session:
            instance = session.get(LabInstance, instance_id)
            if instance is None:
                logger.error("Lab instance %s disappeared before ready update", instance_id)
                return
            if snapshot is not None:
                apply_task_snapshot(instance, snapshot)
            
            try:
                instance.secrets_key = _register_vpn_peer(instance_id)
            except Exception as exc:
                logger.exception("Failed to register VPN peer for lab %s", instance_id)
                raise LabRuntimeAwsError("Failed to configure VPN routing") from exc

            set_lab_status(
                session,
                instance,
                status=LAB_STATUS_READY,
                message="Lab is running and VPN routing is configured.",
                progress=100,
                phase="ecs-ready",
            )
            session.commit()

        logger.info("Lab %s is READY on ECS task %s", instance_id, task_arn)
    except (LabRuntimeConfigError, LabRuntimeAwsError) as exc:
        logger.exception("ECS lab provisioning failed for %s", instance_id)
        try:
            _mark_failed(
                instance_id=instance_id,
                template_id=template_id,
                user_id=user_id,
                message="Lab provisioning failed. Credits were refunded.",
                failure_reason=str(exc),
            )
        except SQLAlchemyError:
            logger.exception("Database compensation failed after ECS provisioning failure")
            raise
        raise
    except SQLAlchemyError as exc:
        logger.exception("Database write failed while provisioning ECS lab")
        raise RuntimeError("Could not update lab provisioning state") from exc
