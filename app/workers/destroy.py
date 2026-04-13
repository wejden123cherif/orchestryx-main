from app.workers.celery_app import celery_app, DESTROY_QUEUE
import logging

logger = logging.getLogger(__name__)


@celery_app.task(queue=DESTROY_QUEUE, bind=True, max_retries=2)
def destroy_lab(self, instance_id: str, cfn_stack_name: str):
    """
    Background task that destroys a lab environment on AWS.
    Called when user stops a lab or TTL expires.

    Steps:
    1. Run CDK destroy on the stack
    2. Update lab instance status to DESTROYED
    """
    logger.info(f"Starting teardown for lab instance {instance_id}")

    try:
        # TODO: implement full CDK destroy
        logger.info(f"Would destroy CDK stack {cfn_stack_name}")

    except Exception as e:
        logger.error(f"Teardown failed for {instance_id}: {e}")
        raise self.retry(exc=e, countdown=30)