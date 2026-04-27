# API Routes

This folder contains FastAPI routers. Route modules should validate inputs, enforce authentication, call service/database helpers, and return API-safe responses.

Current contents:

- `auth.py`: Cognito-backed register, login, email confirmation, and token refresh.
- `catalog.py`: authenticated lab template catalog reads.
- `labs.py`: authenticated lab start, status, active-list, config download, and teardown dispatch.

Future use:

- Add billing, admin, custom topology, and Docker upload routers here.
- Keep business-heavy logic out of route functions when it grows; move it into `services/` or dedicated domain modules.
