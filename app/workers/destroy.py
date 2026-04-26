import logging
import subprocess
from datetime import datetime, timezone

import boto3
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import AWS_REGION, CDK_INFRA_PATH, DATABASE_URL
from app.models.lab_instance import LabInstance
from app.workers.celery_app import DESTROY_QUEUE, celery_app

logger = logging.getLogger(__name__)

SYNC_DATABASE_URL = DATABASE_URL.replace("+asyncpg", "")
engine = create_engine(SYNC_DATABASE_URL)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def _mark_destroyed(instance_id: str) -> None:
    """Persist final lab state from a synchronous Celery worker."""
    with SessionLocal() as session:
        instance = session.get(LabInstance, instance_id)
        if instance is None:
            logger.error("Lab instance %s not found while marking DESTROYED", instance_id)
            return

        instance.status = "DESTROYED"
        instance.destroyed_at = datetime.now(timezone.utc)
        session.commit()


def _delete_secret(secret_key: str) -> None:
    """Delete the VPN config secret, ignoring missing-secret cleanup races."""
    secrets = boto3.client("secretsmanager", region_name=AWS_REGION)
    try:
        secrets.delete_secret(
            SecretId=secret_key,
            ForceDeleteWithoutRecovery=True,
        )
    except secrets.exceptions.ResourceNotFoundException:
        logger.info("Secret %s was already missing", secret_key)


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
        logger.info("Destroying CDK stack %s from %s", cfn_stack_name, infra_path)
        destroy_result = subprocess.run(
            ["cdk", "destroy", cfn_stack_name, "--force"],
            cwd=infra_path,
            timeout=600,
            capture_output=True,
            text=True,
        )

        if destroy_result.returncode != 0:
            logger.error(
                "CDK destroy failed for %s with return code %s: %s",
                cfn_stack_name,
                destroy_result.returncode,
                destroy_result.stderr,
            )

        if secrets_key is not None:
            try:
                logger.info("Deleting VPN config secret %s", secrets_key)
                _delete_secret(secrets_key)
            except Exception:
                logger.exception("Failed to delete secret %s; continuing teardown", secrets_key)

        logger.info("Marking lab instance %s as DESTROYED", instance_id)
        _mark_destroyed(instance_id)
        logger.info("Teardown complete for lab instance %s", instance_id)

    except Exception as exc:
        logger.exception("Teardown failed for lab instance %s", instance_id)
        raise self.retry(exc=exc, countdown=30, max_retries=2)
