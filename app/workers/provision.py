from app.workers.celery_app import celery_app, PROVISION_QUEUE
import logging

logger = logging.getLogger(__name__)


@celery_app.task(queue=PROVISION_QUEUE, bind=True, max_retries=2)
def provision_lab(self, instance_id: str, template_id: str, user_id: str):
    """
    Background task that provisions a lab environment on AWS.
    Called by FastAPI after creating a LabInstance record.

    Steps:
    1. Read lab template from DB
    2. Generate WireGuard keypair
    3. Run CDK deploy
    4. Write EC2 IP + VPN config to DB
    5. Update lab instance status to RUNNING
    """
    logger.info(f"Starting provisioning for lab instance {instance_id}")

    try:
        # TODO: implement full CDK provisioning
        # For now just log — full implementation comes with CDK stack
        logger.info(f"Would deploy CDK stack for template {template_id}")
        logger.info(f"Stack name: orchestryx-lab-{instance_id}")

    except Exception as e:
        logger.error(f"Provisioning failed for {instance_id}: {e}")
        raise self.retry(exc=e, countdown=30)