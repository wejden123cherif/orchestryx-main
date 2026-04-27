# API App

This is the FastAPI backend for Orchestryx. It owns HTTP request handling, Cognito JWT validation, async database access, API schemas, and user-facing lab lifecycle endpoints.

Current contents:

- `main.py`: FastAPI app creation, middleware, routers, startup table creation, and seed loading.
- `config.py`: environment variable parsing for database, AWS, CORS, SQS, and CDK settings.
- `database.py`: async SQLAlchemy engine and session dependency for request handlers.
- `api/`: route modules.
- `middleware/`: request auth dependencies.
- `models/`: SQLAlchemy models.
- `services/`: service wrappers used by route handlers.
- `seeds.py`: MVP catalog seed data.

Future use:

- Replace startup `create_all` with Alembic migrations before production.
- Keep request/response concerns here; long-running provisioning stays in `workers/`.
- Add new API domains as subpackages only when they have clear ownership.
