import logging
import subprocess
from datetime import datetime, timezone

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy import create_engine
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from apps.api.config import AWS_REGION, CDK_INFRA_PATH, DATABASE_URL
from apps.api.models.lab_instance import LabInstance
from workers.celery_app import DESTROY_QUEUE, celery_app

logger = logging.getLogger(__name__)

LAB_STATUS_RUNNING = "RUNNING"
LAB_STATUS_DESTROYING = "DESTROYING"

SYNC_DATABASE_URL = DATABASE_URL.replace("+asyncpg", "")
engine = create_engine(
    SYNC_DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def _instance_id_from_stack_name(cfn_stack_name: str) -> str:
    """Extract the lab instance id from orchestryx-lab-{instance_id}."""
    prefix = "orchestryx-lab-"
    if not cfn_stack_name.startswith(prefix):
        raise RuntimeError(f"Unexpected lab stack name: {cfn_stack_name}")
    return cfn_stack_name.removeprefix(prefix)


def _destroy_context_args(cfn_stack_name: str) -> list[str]:
    """
    CDK still synthesizes app.py during destroy, so it needs context values.

    Only instance_id must match the deployed stack name. The other values are
    harmless placeholders used only to let the CDK app synthesize the stack
    shape CloudFormation needs for deletion.
    """
    instance_id = _instance_id_from_stack_name(cfn_stack_name)
    return [
        "--context",
        f"instance_id={instance_id}",
        "--context",
        "docker_image=bkimminich/juice-shop:latest",
        "--context",
        "wg_server_privkey=DESTROY_PLACEHOLDER",
        "--context",
        "wg_client_pubkey=DESTROY_PLACEHOLDER",
        "--context",
        "flag=ORCHESTRYX{destroy_placeholder}",
        "--context",
        "instance_type=t3.small",
        "--context",
        "challenge_port=3000",
        "--context",
        "challenge_path=/",
    ]


def _mark_destroyed(instance_id: str) -> None:
    """Persist final lab state from a synchronous Celery worker."""
    try:
        with SessionLocal() as session:
            instance = session.get(LabInstance, instance_id)
            if instance is None:
                logger.error("Lab instance %s not found while marking DESTROYED", instance_id)
                return

            instance.status = "DESTROYED"
            instance.destroyed_at = datetime.now(timezone.utc)
            session.commit()
    except SQLAlchemyError as exc:
        logger.exception("Database write failed while marking lab DESTROYED")
        raise RuntimeError("Could not mark lab as destroyed") from exc


def _delete_secret(secret_key: str) -> None:
    """Delete the VPN config secret, ignoring missing-secret cleanup races."""
    try:
        secrets = boto3.client("secretsmanager", region_name=AWS_REGION)
        secrets.delete_secret(
            SecretId=secret_key,
            ForceDeleteWithoutRecovery=True,
        )
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code == "ResourceNotFoundException":
            logger.info("VPN config secret was already missing")
            return
        logger.exception("Secrets Manager delete failed")
        raise RuntimeError("Could not delete VPN config") from exc
    except BotoCoreError as exc:
        logger.exception("Secrets Manager client operation failed")
        raise RuntimeError("Could not delete VPN config") from exc


@celery_app.task(queue=DESTROY_QUEUE)
def destroy_expired_labs() -> int:
    """
    Queue teardown for labs that passed their TTL.

    This is the budget safety net: if a user forgets to click Stop Lab, the
    worker marks the lab DESTROYING and reuses destroy_lab for CloudFormation
    cleanup and VPN secret deletion.
    """
    now = datetime.now(timezone.utc)
    expired_labs: list[tuple[str, str, str | None]] = []

    try:
        with SessionLocal() as session:
            result = session.execute(
                select(LabInstance).where(
                    LabInstance.status == LAB_STATUS_RUNNING,
                    LabInstance.expires_at.is_not(None),
                    LabInstance.expires_at <= now,
                )
            )
            instances = result.scalars().all()

            for instance in instances:
                instance.status = LAB_STATUS_DESTROYING
                expired_labs.append(
                    (
                        instance.id,
                        instance.cfn_stack_name or f"orchestryx-lab-{instance.id}",
                        instance.secrets_key,
                    )
                )

            session.commit()
    except SQLAlchemyError as exc:
        logger.exception("Database query failed while finding expired labs")
        raise RuntimeError("Could not find expired labs") from exc

    for instance_id, cfn_stack_name, secrets_key in expired_labs:
        logger.info("Queueing TTL teardown for expired lab %s", instance_id)
        destroy_lab.delay(
            instance_id=instance_id,
            cfn_stack_name=cfn_stack_name,
            secrets_key=secrets_key,
        )

    return len(expired_labs)


@celery_app.task(queue=DESTROY_QUEUE, bind=True, max_retries=2)
def destroy_lab(self, instance_id: str, cfn_stack_name: str, secrets_key: str | None = None):
    """
    Destroy one lab CDK stack and mark the DB row as destroyed.

    CDK destroy failures are logged but still finalize the lab row so the user
    is not stuck; those cases require manual AWS cleanup.
    """
    logger.info("Starting teardown for lab instance %s", instance_id)
    infra_path = CDK_INFRA_PATH

    try:
        logger.info("Destroying CDK stack %s", cfn_stack_name)
        try:
            destroy_result = subprocess.run(
                [
                    "cdk",
                    "destroy",
                    cfn_stack_name,
                    "--force",
                    *_destroy_context_args(cfn_stack_name),
                ],
                cwd=infra_path,
                timeout=600,
                capture_output=True,
                text=True,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            logger.exception("CDK destroy command could not be started or completed")
            raise RuntimeError("CDK destroy failed") from exc

        if destroy_result.returncode != 0:
            logger.error(
                "CDK destroy failed for %s with return code %s",
                cfn_stack_name,
                destroy_result.returncode,
            )

        if secrets_key is not None:
            try:
                logger.info("Deleting VPN config secret")
                _delete_secret(secrets_key)
            except Exception:
                logger.exception("Failed to delete VPN config secret; continuing teardown")

        logger.info("Marking lab instance %s as DESTROYED", instance_id)
        _mark_destroyed(instance_id)
        logger.info("Teardown complete for lab instance %s", instance_id)

    except Exception as exc:
        logger.exception("Teardown failed for lab instance %s", instance_id)
        raise self.retry(exc=exc, countdown=30, max_retries=2)
