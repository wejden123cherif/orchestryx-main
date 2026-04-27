# API Summary

This folder contains the FastAPI backend for Orchestryx.

Key files and folders:

- `main.py`: FastAPI app, middleware registration, routers, health check, startup initialization.
- `config.py`: environment-driven configuration.
- `database.py`: async SQLAlchemy engine and session dependency.
- `seeds.py`: MVP lab template seed data.
- `api/`: route modules.
- `middleware/`: Cognito JWT validation.
- `models/`: SQLAlchemy ORM models.
- `services/`: external service and domain helpers.

Future use:

- Add Alembic migrations and remove startup schema creation before production rollout.
- Keep API runtime database access async.
