# Orchestryx

Orchestryx is a cyber range as a service platform. Users authenticate, hold credits, choose a lab template, and launch isolated AWS-backed security labs without touching AWS directly. The backend owns identity integration, credit checks, lab lifecycle state, asynchronous provisioning, VPN access material, and teardown.

The current MVP focuses on pre-built labs. The roadmap adds custom topology building and user-supplied Docker lab workloads.

## Stack

- FastAPI on Python 3.11 for the API.
- Celery workers for long-running lab provisioning and teardown.
- PostgreSQL, with Aurora Serverless v2 as the production database.
- Amazon Cognito for authentication.
- Amazon SQS as the Celery broker.
- AWS CDK and CloudFormation for lab infrastructure.
- AWS Secrets Manager for runtime secrets and generated VPN configs.
- Amazon ECS/Fargate and ECR for API and worker deployment.
- A local `cockpit/` app for AWS operations visibility.

## Repository Layout

```text
apps/api/       FastAPI application, routes, models, database, services
workers/        Celery worker app and lab lifecycle tasks
infra/          AWS CDK app used by workers to provision lab stacks
cockpit/        Local operator dashboard for ECS, SQS, logs, costs, and labs
scripts/        Deployment/setup scripts and AWS CLI JSON assets
docs/           Product, architecture, roadmap, and AWS setup documentation
```

Each folder includes a `summary.md` with its purpose and key files.

## Setup

Prerequisites:

- Python 3.11
- AWS CLI credentials for the Orchestryx account
- Docker and Docker Compose for containerized local development
- Node.js/npm and AWS CDK CLI when running provisioning outside containers
- WireGuard tools when running provisioning outside containers

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

Run workers directly:

```bash
celery -A workers.celery_app worker --loglevel=info --pool=solo -I workers.provision,workers.destroy
```

Run the local Docker stack:

```bash
docker compose up --build
```

Run the local cockpit:

```bash
make cockpit
```

Deploy to ECS from Linux, macOS, WSL, or CI:

```bash
make deploy
make deploy-api
make deploy-worker
```

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
      -> CDK/CloudFormation lab deployment
      -> Secrets Manager VPN config storage
      -> SQS-driven teardown
```

Key docs:

- [Overview](docs/overview.md)
- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [AWS setup reference](docs/aws-setup.md)

## API Surface

- Public: `POST /auth/register`, `POST /auth/login`, `POST /auth/confirm`, `POST /auth/refresh`, `GET /health`
- Authenticated: `GET /me`, `GET /catalog`, `GET /catalog/{template_id}`
- Authenticated labs: `POST /labs/start`, `GET /labs/active`, `GET /labs/{instance_id}/status`, `GET /labs/{instance_id}/config`, `DELETE /labs/{instance_id}`

## Current State

Implemented:

- FastAPI API structure, Cognito auth, user linking, catalog reads, lab start/status/config/delete flows.
- Async API database access and sync worker database access.
- SQS-backed Celery workers for provision and destroy tasks.
- CDK infrastructure app in the monorepo.
- Dockerfiles, Docker Compose, ECS deploy scripts, AWS resource manifests, and local cockpit.

Still in progress:

- Full end-to-end production lab provisioning validation.
- Migration from startup `create_all` to Alembic migrations.
- Production networking/load balancing hardening.
- Payment/credit funding flow.
- Custom topology builder and Docker upload phases.

## Contribution Notes

- Keep production values in environment variables or Secrets Manager, not source code.
- API code uses async SQLAlchemy sessions; workers use sync SQLAlchemy sessions.
- Keep Cognito auth on user, catalog, and lab endpoints unless intentionally public.
- Do not log passwords, tokens, WireGuard keys, VPN configs, or sensitive CDK output.
- Update docs when endpoint behavior, AWS resources, deployment flow, or folder structure changes.
