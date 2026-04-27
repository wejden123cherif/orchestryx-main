import logging
import subprocess
from datetime import datetime, timezone

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from apps.api.config import AWS_REGION, CDK_INFRA_PATH, DATABASE_URL
from apps.api.models.lab_instance import LabInstance
from workers.celery_app import DESTROY_QUEUE, celery_app

logger = logging.getLogger(__name__)

SYNC_DATABASE_URL = DATABASE_URL.replace("+asyncpg", "")
engine = create_engine(
    SYNC_DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


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
                ["cdk", "destroy", cfn_stack_name, "--force"],
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
