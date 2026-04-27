from celery import Celery
from app.config import (
    AWS_REGION,
    DESTROY_QUEUE,
    PROVISION_QUEUE,
    SQS_DESTROY_URL,
    SQS_PROVISION_URL,
)

celery_app = Celery("orchestryx")

celery_app.conf.update(
    broker_url=f"sqs://",
    broker_transport="SQS",
    broker_transport_options={
        "region": AWS_REGION,
        "is_secure": True,
        "predefined_queues": {
            PROVISION_QUEUE: {
                "url": SQS_PROVISION_URL,
                "visibility_timeout": 600,
            },
            DESTROY_QUEUE: {
                "url": SQS_DESTROY_URL,
                "visibility_timeout": 600,
            },
        },
    },
    task_default_queue=PROVISION_QUEUE,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)
