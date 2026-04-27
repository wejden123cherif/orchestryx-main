# Repository Summary

This repository is the Orchestryx backend monorepo. It contains the API, workers, CDK infrastructure, deployment scripts, local operations cockpit, and project documentation.

Key files:

- `README.md`: quick start, usage, and high-level architecture.
- `requirements.txt`: shared Python dependencies.
- `Dockerfile`: API container.
- `Dockerfile.worker`: Celery worker container.
- `docker-compose.yml`: local API, worker, and Postgres stack.
- `Makefile`: common local and AWS operations commands.

Future use:

- Keep new runtime services under a clear top-level folder.
- Keep long-form docs in `docs/`.
- Keep operational scripts in `scripts/` and infrastructure definitions in `infra/`.
