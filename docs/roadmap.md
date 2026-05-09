# Roadmap

## Current State

Implemented:

- FastAPI API with Cognito-backed auth flows.
- Cognito JWT middleware for protected routes.
- User, lab template, and lab instance models.
- Startup database initialization and seed template for the MVP.
- Catalog and lab lifecycle endpoints.
- Credit deduction when a lab starts.
- Celery workers backed by SQS.
- Provision and destroy worker modules.
- In-repo CDK app under `infra/`.
- Dockerfiles, Docker Compose, ECS task definitions, setup/deploy scripts, and AWS status CLI.

## Active Work

- Validate the full production path from API request to SQS worker to CDK deployment to lab access.
- Harden production networking between ECS tasks and Aurora.
- Move schema management from startup `create_all` to Alembic migrations.
- Add observability and alarm coverage for failed provisioning, failed destruction, queue backlog, API errors, and cost spikes.
- Tighten IAM from broad managed policies to least-privilege custom policies.

## Next Steps

1. Finish and test the first CDK-backed lab stack end to end.
2. Add database migrations and remove startup schema mutation before production rollout.
3. Add automatic TTL teardown for expired labs.
4. Add credit top-up or payment integration.
5. Add admin workflows for template creation and deactivation.
6. Put the API behind an Application Load Balancer and narrow direct task ingress.
7. Add CI checks for compile, lint, tests, Docker build, and task definition validation.

## Future Phases

Phase 2: custom topology builder.

- User-defined subnets, routes, firewall rules, services, versions, and CVE targets.
- Template validation before provisioning.
- Cost estimation before launch.

Phase 3: Docker upload.

- User-uploaded lab containers.
- Image scanning and policy checks.
- Controlled runtime placement and network isolation.

Phase 4: platform operations.

- Multi-environment account separation.
- Least-privilege IAM.
- Automated rollback.
- Richer AWS status CLI with alarms, traces, and cost anomaly visibility.
