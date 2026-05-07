# Workers

This folder contains background workers and Celery task definitions. Workers are separate from the FastAPI app because they run long-lived provisioning and teardown jobs outside the HTTP request lifecycle.

Current contents:

- `celery_app.py`: Celery configuration using Amazon SQS predefined queues.
- `provision.py`: lab provisioning task that loads DB state, runs CDK deploy, stores WireGuard config in Secrets Manager, and marks the lab running.
- `destroy.py`: lab teardown task that runs CDK destroy, deletes the VPN secret, marks the lab destroyed, and queues TTL expiry cleanup.

The worker container currently starts Celery Beat inside the worker process so
MVP labs auto-destroy after `expires_at`. If the worker service is scaled above
one replica later, split Beat into its own single-replica service to avoid
duplicate expiry scans.

Future use:

- Add TTL expiry, cleanup sweeps, billing reconciliation, image scanning, and topology build workers here.
- Keep worker code synchronous for SQLAlchemy unless the worker runtime is intentionally redesigned.
- ECS should run this folder as a private worker service with no public listener.
