# API Routes Summary

This folder contains FastAPI route modules.

Key files:

- `auth.py`: Cognito registration, login, confirmation, and token refresh routes.
- `catalog.py`: authenticated lab template catalog reads.
- `labs.py`: authenticated lab start, active list, status, config download, and teardown routes.

Future use:

- Add admin/template-management routes separately from user-facing lab routes.
- Keep public routes explicit and protect user/lab data with Cognito auth dependencies.
