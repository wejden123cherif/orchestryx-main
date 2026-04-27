# Models

This folder contains SQLAlchemy ORM models for persistent Orchestryx data. Models are imported by `apps.api.main` so metadata is registered before startup table creation.

Current contents:

- `user.py`: Cognito-linked user account, credits, and subscription tier.
- `lab_template.py`: pre-built lab catalog entries and deployment metadata.
- `lab_instance.py`: per-user lab session state, CloudFormation stack data, access metadata, and lifecycle timestamps.

Future use:

- Add billing, transactions, custom topologies, uploaded images, and audit/event models here.
- Keep schema changes migration-driven once Alembic is introduced.
