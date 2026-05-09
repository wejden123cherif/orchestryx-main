# Workers Summary

This folder contains synchronous Celery workers for lab lifecycle jobs.

Key files:

- `celery_app.py`: Celery configuration using SQS as broker.
- `provision.py`: disabled lab-runtime task path that records controlled failures and refunds credits.
- `destroy.py`: DB-only cleanup for expired, stale, and stopped lab rows.

Future use:

- Add retry/idempotency helpers and automatic TTL cleanup tasks here.
- Keep worker database access synchronous unless the Celery execution model changes.
