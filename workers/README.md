# Workers

This folder contains background workers and Celery task definitions. Workers are separate from the FastAPI app because they run long-lived provisioning and teardown jobs outside the HTTP request lifecycle.

Current contents:

- `celery_app.py`: Celery configuration using Amazon SQS predefined queues.
- `provision.py`: disabled lab-runtime task path. It records a controlled failure and refunds credits without creating cloud resources.
- `destroy.py`: DB lifecycle cleanup for stopped, expired, and stale lab rows. It does not invoke CDK or delete cloud resources.

The worker container currently starts Celery Beat inside the worker process so
stale provisioning rows are failed after the configured timeout and expired rows
are marked for cleanup. If the worker service is scaled above one replica later,
split Beat into its own single-replica service to avoid duplicate scans.

Future use:

- Add orphan-resource reconciliation, billing aggregation, image scanning, warm-pool maintenance, and topology build workers here.
- Keep worker code synchronous for SQLAlchemy unless the worker runtime is intentionally redesigned.
- ECS should run this folder as a private worker service with no public listener.
