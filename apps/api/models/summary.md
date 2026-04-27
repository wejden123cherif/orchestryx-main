# Models Summary

This folder contains SQLAlchemy ORM models for the API and workers.

Key files:

- `user.py`: Cognito-linked platform users and credit balances.
- `lab_template.py`: pre-built lab catalog records.
- `lab_instance.py`: per-user lab lifecycle records.
- `__init__.py`: exports all models so SQLAlchemy metadata can register them.

Future use:

- Add payment, audit, topology, and Docker upload models as product phases expand.
