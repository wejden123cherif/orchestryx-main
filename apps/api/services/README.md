# Services

This folder contains reusable application services used by API routes. Services should hide external APIs or shared business operations behind small, testable functions.

Current contents:

- `cognito.py`: boto3 wrapper for Cognito sign-up, login, confirmation, and refresh token flows.
- `user.py`: user lookup and creation logic for linking Cognito identities to local database rows.

Future use:

- Add credit ledger, payment, topology validation, template management, and upload/image scanning services here.
- Keep Celery task orchestration in `workers/`; keep HTTP-only concerns in `api/`.
