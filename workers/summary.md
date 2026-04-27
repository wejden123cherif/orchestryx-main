# Workers Summary

This folder contains synchronous Celery workers for lab lifecycle jobs.

Key files:

- `celery_app.py`: Celery configuration using SQS as broker.
- `provision.py`: CDK deploy, WireGuard config generation, Secrets Manager write, and lab status update.
- `destroy.py`: CDK destroy, generated secret cleanup, and lab status update.

Future use:

- Add retry/idempotency helpers and automatic TTL cleanup tasks here.
- Keep worker database access synchronous unless the Celery execution model changes.
