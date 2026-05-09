# Orchestryx

Orchestryx is a cyber range as a service platform. Users authenticate, hold credits, browse lab templates, and use a control plane that is deployed through AWS platform infrastructure. The backend owns identity integration, credit checks, lab lifecycle state, and asynchronous worker dispatch.

The current MVP focuses on pre-built labs. The roadmap adds custom topology building and user-supplied Docker lab workloads.

## Stack

- FastAPI on Python 3.11 for the API.
- Celery workers for asynchronous background services.
- PostgreSQL, with Aurora Serverless v2 as the production database.
- Amazon Cognito for authentication.
- Amazon SQS as the Celery broker.
- AWS CDK for long-lived platform infrastructure.
- AWS Secrets Manager for runtime secrets.
- Amazon ECS/Fargate and ECR for API and worker deployment.
- A `scripts/aws/status.py` CLI for AWS operations visibility.

## Repository Layout

```text
apps/api/             FastAPI backend
apps/web/             Next.js frontend
workers/              Async background services
infra/platform_cdk/   AWS platform infrastructure
labs/                 Lab image source folders kept for future use
alembic/              Database migrations
scripts/aws/          Legacy/manual AWS references and status tooling
scripts/              Deployment/setup scripts and AWS CLI JSON assets
docs/                 Product, architecture, roadmap, and AWS setup documentation
```

Each folder includes a `summary.md` with its purpose and key files.

## Setup

Prerequisites:

- Python 3.11
- AWS CLI credentials for the Orchestryx account
- Docker and Docker Compose for containerized local development
- Node.js/npm and AWS CDK CLI when synthesizing or deploying `infra/platform_cdk`

Install dependencies:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Create local environment values:

```bash
copy .env.example .env
```

Production-style development points `DATABASE_URL` at Aurora and sets `DB_SSL_MODE=require`. Isolated local development may use the Docker Compose Postgres service with `DB_SSL_MODE=disable`.

## Usage

Run the API directly:

```bash
uvicorn apps.api.main:app --reload
```

Run the web frontend:

```bash
cd apps/web
npm install
npm run dev
```

Run workers directly:

```bash
celery -A workers.celery_app worker --loglevel=info --pool=solo -I workers.provision,workers.destroy
```

Run the local Docker stack:

```bash
docker compose up --build
```

Root frontend shortcuts:

```bash
make web-dev
make web-build
make web-typecheck
```

Check AWS infrastructure status:

```bash
make aws-status
# or with options
python scripts/aws/status.py --section ecs aurora
python scripts/aws/status.py --logs api
```

Platform infrastructure is created and updated through `infra/platform_cdk/`.
After CDK has created the ECS cluster, services, and ECR repositories, deploy
application images from Linux, macOS, WSL, or CI:

```bash
make platform-synth-dev
make platform-diff-dev
make platform-deploy-dev
make platform-export-dev
make deploy-dev
```

`scripts/linux/deploy.sh` only builds, tags, pushes images, and updates existing
ECS services. It reads `AWS_REGION`, `AWS_ACCOUNT_ID`,
`ORCHESTRYX_ECS_CLUSTER_NAME`, `ORCHESTRYX_API_SERVICE_NAME`,
`ORCHESTRYX_WORKER_SERVICE_NAME`, `ORCHESTRYX_API_ECR_REPO_URI`, and
`ORCHESTRYX_WORKER_ECR_REPO_URI` from explicit environment variables,
`.env.deploy`, or `.env.<env>.generated`.

For a clean dev AWS account, deploy the platform in phases: create ECR and
foundation stacks, export `.env.dev.generated`, push initial images with
`ORCHESTRYX_ENV=dev ./scripts/linux/deploy.sh images`, create the
`orchestryx/dev/api/env` runtime secret, deploy the remaining CDK stacks, run
`alembic upgrade head`, then run `make deploy-dev`.

Deploy from Windows:

```powershell
.\scripts\windows\deploy.ps1
.\scripts\windows\deploy.ps1 api
.\scripts\windows\deploy.ps1 worker
```

## High-Level Architecture

```text
Client
  -> FastAPI API
      -> Cognito JWT validation
      -> Aurora/PostgreSQL for users, templates, lab instances
      -> SQS task dispatch
  -> Celery worker
      -> Aurora/PostgreSQL state updates
      -> disabled lab-runtime task path until the next runtime is implemented
      -> SQS-driven teardown
```

Key docs:

- [Overview](docs/overview.md)
- [Architecture](docs/architecture.md)
- [Web lab provisioning](docs/provisioning.md)
- [Admin console](docs/admin.md)
- [Cost optimization](docs/cost-optimization.md)
- [Provisioning troubleshooting](docs/troubleshooting-provisioning.md)
- [Roadmap](docs/roadmap.md)
- [AWS setup reference](docs/aws-setup.md)

## API Surface

- Public: `POST /auth/register`, `POST /auth/login`, `POST /auth/confirm`, `POST /auth/refresh`, `GET /health`
- Authenticated: `GET /me`, `GET /catalog`, `GET /catalog/{template_id}`
- Authenticated labs: `POST /labs/start`, `GET /labs/active`, `GET /labs/{instance_id}/status`, `GET /labs/{instance_id}/config`, `DELETE /labs/{instance_id}`
- Admin: `GET /admin/overview`, `GET /admin/users`, `POST /admin/users/{user_id}/credits`, `GET /admin/labs`, `POST /admin/labs/{instance_id}/stop`, `GET /admin/events`, `GET /admin/credits`

## Lab Lifecycle

New lab starts move through `QUEUED`, `PROVISIONING`, `STARTING`, and `READY`. Teardown uses `DESTROYING` and then `STOPPED`; TTL expiry records `EXPIRED`; unrecoverable startup failures become `FAILED` and refund credits. Legacy `RUNNING` and `DESTROYED` rows are normalized by the API for compatibility.

## Important Environment Variables

- `DATABASE_URL`, `DB_SSL_MODE`, `SQL_ECHO`
- `AWS_REGION`, `AWS_ACCOUNT_ID`
- `COGNITO_USER_POOL_ID`, `COGNITO_APP_CLIENT_ID`
- `SQS_PROVISION_URL`, `SQS_DESTROY_URL`, `PROVISION_QUEUE`, `DESTROY_QUEUE`
- `CORS_ALLOWED_ORIGINS`
- `LAB_RUNTIME_ENABLED` currently defaults to `false`
- `LAB_MAX_ACTIVE_PER_USER`
- `LAB_PROVISION_TIMEOUT_SECONDS`
- `LAB_CLEANUP_STUCK_AFTER_SECONDS`
- `LAB_STARTUP_RETRY_SECONDS`
- `LAB_RETENTION_DAYS`
- `AWS_ECS_CLUSTER`, `AWS_API_SERVICE`, `AWS_WORKER_SERVICE`
- `AWS_AURORA_CLUSTER`, `AWS_API_LOG_GROUP`, `AWS_WORKER_LOG_GROUP`
- `AWS_ECR_API_REPOSITORY`, `AWS_ECR_WORKER_REPOSITORY`
- `AWS_VPC_ID` when the admin overlay should focus on one known VPC

## Current State

Implemented:

- FastAPI API structure, Cognito auth, user linking, catalog reads, lab start/status/config/delete flows.
- Async API database access and sync worker database access.
- SQS-backed Celery workers for background tasks.
- Platform CDK app in `infra/platform_cdk/`.
- Dockerfiles, Docker Compose, ECS deploy scripts, AWS resource manifests, and AWS status CLI.

Still in progress:

- Lab runtime implementation after the platform deployment path is stable.
- Production networking/load balancing hardening.
- Payment/credit funding flow.
- Custom topology builder and Docker upload phases.

## Contribution Notes

- Keep production values in environment variables or Secrets Manager, not source code.
- API code uses async SQLAlchemy sessions; workers use sync SQLAlchemy sessions.
- Keep Cognito auth on user, catalog, and lab endpoints unless intentionally public.
- Do not log passwords, tokens, runtime access configs, or sensitive CDK output.
- Update docs when endpoint behavior, AWS resources, deployment flow, or folder structure changes.
