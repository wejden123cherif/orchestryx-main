# Workers

This folder contains background workers and Celery task definitions. Workers are separate from the FastAPI app because they run long-lived provisioning and teardown jobs outside the HTTP request lifecycle.

Current contents:

- `celery_app.py`: Celery configuration using Amazon SQS predefined queues.
- `provision.py`: lab provisioning task that loads DB state, updates lifecycle progress, runs CDK deploy, waits for EC2 readiness, stores WireGuard config in Secrets Manager, and marks the lab ready.
- `destroy.py`: lab teardown task that runs CDK destroy, deletes the VPN secret, marks the lab stopped, queues TTL expiry cleanup, and fails/refunds stale provisioning jobs.

The worker container currently starts Celery Beat inside the worker process so
MVP labs auto-destroy after `expires_at` and stale provisioning labs are failed
after the configured timeout. If the worker service is scaled above one replica
later, split Beat into its own single-replica service to avoid duplicate scans.

Future use:

- Add orphan-resource reconciliation, billing aggregation, image scanning, warm-pool maintenance, and topology build workers here.
- Keep worker code synchronous for SQLAlchemy unless the worker runtime is intentionally redesigned.
- ECS should run this folder as a private worker service with no public listener.
