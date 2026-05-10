from celery import Celery
from apps.api.config import (
    AWS_REGION,
    DESTROY_QUEUE,
    LAB_CLEANUP_STUCK_AFTER_SECONDS,
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
    beat_schedule={
        "destroy-expired-labs-every-5-minutes": {
            "task": "workers.destroy.destroy_expired_labs",
            "schedule": 300.0,
            "options": {"queue": DESTROY_QUEUE},
        },
        "fail-stale-provisioning-labs-every-5-minutes": {
            "task": "workers.destroy.fail_stale_provisioning_labs",
            "schedule": 300.0,
            "args": (LAB_CLEANUP_STUCK_AFTER_SECONDS,),
            "options": {"queue": DESTROY_QUEUE},
        },
        "poll-active-lab-tasks-every-minute": {
            "task": "workers.destroy.poll_active_lab_tasks",
            "schedule": 60.0,
            "options": {"queue": DESTROY_QUEUE},
        },
    },
)
