# Orchestryx Backend

Orchestryx is a cyber range as a service platform: Vercel-style on-demand environments, but for cybersecurity labs. Users authenticate, hold a credit balance, choose a lab template, and start an isolated AWS-backed hacking environment without touching AWS directly. The platform owns provisioning, access material generation, status tracking, and teardown.

The MVP focuses on pre-built lab templates. Phase 2 adds a custom topology builder for specific software versions, CVEs, routes, firewall rules, and network layouts. Phase 3 adds Docker upload so users can bring their own lab workloads.

## Current Architecture

The backend is a FastAPI service with asynchronous PostgreSQL access. Long-running lab lifecycle work is delegated to Celery workers over Amazon SQS. Workers use synchronous SQLAlchemy sessions and invoke AWS CDK to create or destroy per-lab infrastructure. AWS Cognito owns identity; the backend validates Cognito JWTs and links Cognito users to local database rows on login.

Production is centered on AWS managed services:

- **FastAPI**: REST API for auth, catalog, user profile, lab lifecycle, and VPN config download.
- **Celery**: background workers for lab provisioning and teardown.
- **Amazon SQS**: broker between API requests and workers.
- **PostgreSQL / Aurora Serverless v2**: production database for users, lab templates, and lab instances.
- **AWS Cognito**: user registration, login, email confirmation, refresh tokens, and JWT issuer.
- **AWS CDK / CloudFormation**: infrastructure deployment path for lab environments.
- **AWS Secrets Manager**: stores generated WireGuard client configs.
- **WireGuard**: current lab access mechanism.
- **ECS / Fargate planned**: target runtime for serverless/containerized lab workloads.
- **ECR planned**: target image registry for pre-built and uploaded lab containers.

The current code still contains MVP provisioning fields for CloudFormation stack names, EC2 public IP output, and WireGuard config delivery while the CDK lab stack is being finished. The product direction is serverless or managed AWS infrastructure wherever practical, with Aurora Serverless v2 for production data and ECS/Fargate planned for lab execution.

## Known AWS Environment

| Resource | Current value |
|---|---|
| AWS region | `eu-central-1` |
| AWS account | `254076817005` |
| Cognito User Pool | `eu-central-1_FCduBIpFa` |
| Aurora Serverless v2 cluster | `orchestryx-db.cluster-cz86ciucmlhr.eu-central-1.rds.amazonaws.com` |
| Provision queue | `orchestryx-provision-lab` |
| Destroy queue | `orchestryx-destroy-lab` |
| CDK bootstrap | Completed in `eu-central-1` |

Docker Compose is for isolated local development and currently includes a local Postgres service. Production should use Aurora, not the Compose database.

## Repository Structure

```text
.
├── app/
│   ├── api/
│   │   ├── auth.py          # Cognito-backed auth endpoints
│   │   ├── catalog.py       # Authenticated lab template catalog endpoints
│   │   └── labs.py          # Authenticated lab lifecycle and config endpoints
│   ├── middleware/
│   │   └── auth.py          # Cognito JWKS fetch and JWT validation
│   ├── models/
│   │   ├── user.py          # User credit/account model
│   │   ├── lab_template.py  # Catalog template model
│   │   └── lab_instance.py  # Per-user lab session model
│   ├── services/
│   │   ├── cognito.py       # Cognito sign-up/login/confirm/refresh calls
│   │   └── user.py          # User lookup/create helper
│   ├── workers/
│   │   ├── celery_app.py    # Celery over SQS configuration
│   │   ├── provision.py     # CDK deploy + VPN secret creation task
│   │   └── destroy.py       # CDK destroy + cleanup task
│   ├── config.py            # Environment-driven configuration
│   ├── database.py          # Async SQLAlchemy engine/session setup
│   ├── main.py              # FastAPI app, routers, startup seeding
│   └── seeds.py             # Initial Juice Shop lab template
├── Dockerfile               # API container
├── Dockerfile.worker        # Celery worker container
├── docker-compose.yml       # Local API + worker + Postgres dev stack
├── requirements.txt         # Direct Python runtime dependencies
└── .env.example             # Documented environment template
```

## Data Model

| Table | Purpose |
|---|---|
| `users` | Cognito-linked user records, email, credit balance, subscription tier, creation time |
| `lab_templates` | Pre-built catalog entries, cost, TTL, Docker image, CDK stack class, instance/runtime size, active flag |
| `lab_instances` | Per-user lab sessions, status, stack name, access endpoint, Secrets Manager key, expiry and teardown timestamps |

Startup creates tables through SQLAlchemy metadata and seeds one active MVP template if the catalog is empty:

- `web-sqli-01`: OWASP Juice Shop SQL injection login bypass lab.

## API Surface

Authentication is Cognito-backed. Public endpoints are limited to auth and health checks. Catalog and lab operations require a valid Cognito bearer token.

### Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | No | Register a Cognito user and send email verification |
| `POST` | `/auth/login` | No | Authenticate with Cognito, return tokens, and create/link local DB user |
| `POST` | `/auth/confirm` | No | Confirm a Cognito email verification code |
| `POST` | `/auth/refresh` | No | Exchange a refresh token for new access/id tokens |

### General

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | No | Process health check |
| `GET` | `/me` | Yes | Current user profile, credit balance, tier, and creation time |

### Catalog

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/catalog` | Yes | List active lab templates |
| `GET` | `/catalog/{template_id}` | Yes | Fetch one active lab template |

### Labs

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/labs/start` | Yes | Deduct credits, create a `PROVISIONING` instance, dispatch provisioning task |
| `GET` | `/labs/active` | Yes | List current user's `PROVISIONING` and `RUNNING` labs |
| `GET` | `/labs/{instance_id}/status` | Yes | Poll a user's lab status and runtime metadata |
| `GET` | `/labs/{instance_id}/config` | Yes | Download WireGuard config for a `RUNNING` lab |
| `DELETE` | `/labs/{instance_id}` | Yes | Mark lab `DESTROYING` and dispatch teardown task |

Lab status flow:

```text
PROVISIONING -> RUNNING -> DESTROYING -> DESTROYED
             \-> FAILED
```

## Environment Variables

See [.env.example](.env.example) for a ready-to-copy template.

| Variable | Required | Purpose |
|---|---:|---|
| `DATABASE_URL` | Yes | PostgreSQL URL. Production should use Aurora Serverless v2. |
| `SQL_ECHO` | No | Enable SQLAlchemy SQL logging. Keep `false` unless debugging locally. |
| `AWS_REGION` | Yes | AWS region, currently `eu-central-1`. |
| `AWS_ACCOUNT_ID` | No | Documentation/convenience value for queue URLs and AWS context. |
| `COGNITO_USER_POOL_ID` | Yes | Cognito User Pool ID. |
| `COGNITO_APP_CLIENT_ID` | Yes | Cognito app client used for USER_PASSWORD_AUTH and refresh. |
| `PROVISION_QUEUE` | No | Celery/SQS provision queue name. |
| `DESTROY_QUEUE` | No | Celery/SQS destroy queue name. |
| `SQS_PROVISION_URL` | Yes | Full SQS URL for provisioning tasks. |
| `SQS_DESTROY_URL` | Yes | Full SQS URL for teardown tasks. |
| `CORS_ALLOWED_ORIGINS` | No | Comma-separated frontend origins. |
| `CDK_INFRA_PATH` | Yes | Path to the CDK infrastructure project inside the current runtime. |
| `CDK_INFRA_HOST_PATH` | Docker only | Host path mounted into containers as the CDK infrastructure project. |
| `WG_DNS` | No | DNS server written into generated WireGuard client configs. |

## Production Database

Production data lives in Aurora Serverless v2. Set `DB_SSL_MODE=require` for Aurora production connections; keep `DB_SSL_MODE=disable` only for local Docker Compose or trusted local Postgres development.

The API currently calls `Base.metadata.create_all()` at startup for MVP speed. Before a real production rollout, replace startup schema creation with an explicit migration step such as `alembic upgrade head`.

The API and Celery workers must run in the same VPC as Aurora, or through an approved network path that can reach the Aurora cluster and is allowed by its security groups.

## Local Development

Prerequisites:

- Python 3.11
- AWS CLI configured with access to the Orchestryx AWS account
- Node.js/npm and AWS CDK CLI if running workers outside Docker
- WireGuard tools if running provisioning workers outside Docker
- Network access to the selected database: local Postgres for isolated dev or Aurora for production-style dev

### Raw FastAPI Runtime

Create a virtual environment and install dependencies:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Create `.env`:

```bash
copy .env.example .env
```

For production-style development, set `DATABASE_URL` to the commented Aurora URL in `.env` and provide the password through `AURORA_DB_PASSWORD` or by expanding the URL directly in your private `.env`. For isolated local development, use a local Postgres URL.

Run the API:

```bash
uvicorn app.main:app --reload
```

Run the worker in a second terminal:

```bash
celery -A app.workers.celery_app worker --loglevel=info --pool=solo -I app.workers.provision,app.workers.destroy
```

API docs are exposed at `http://localhost:8000/docs`.

### Docker Compose

Docker Compose builds two Python images:

- `api`: FastAPI, uvicorn, AWS CDK CLI, WireGuard tools.
- `worker`: Celery, AWS CDK CLI, WireGuard tools.

Compose also starts `db` using `postgres:16` for isolated local development. This is not the production database; production uses Aurora Serverless v2.

Set `.env` values first, especially:

```text
COGNITO_APP_CLIENT_ID
SQS_PROVISION_URL
SQS_DESTROY_URL
CDK_INFRA_PATH=/infra
CDK_INFRA_HOST_PATH=../orchestryx-infra
```

Start the stack:

```bash
docker compose up --build
```

Compose mounts `~/.aws:/root/.aws:ro` so the API and worker can use local AWS credentials. It mounts `${CDK_INFRA_HOST_PATH}` to `${CDK_INFRA_PATH}` so workers can run `cdk deploy` and `cdk destroy`.

## Provisioning Flow

1. User logs in through Cognito.
2. Backend verifies the Cognito JWT against the User Pool JWKS.
3. User starts a pre-built lab by template ID.
4. API verifies credits, deducts the template cost, creates a `lab_instances` row, and sends a Celery task through SQS.
5. Worker loads the template and instance using a synchronous SQLAlchemy session.
6. Worker generates WireGuard keypairs, invokes CDK, reads CloudFormation outputs, writes VPN config to Secrets Manager, and marks the lab `RUNNING`.
7. User polls status and downloads the WireGuard config when running.
8. User deletes the lab; API marks it `DESTROYING` and dispatches teardown.
9. Worker runs CDK destroy, deletes the VPN secret, and marks the lab `DESTROYED`.

## Current Build Status

### Done

- FastAPI application structure.
- Environment-driven configuration with required variable validation.
- Async SQLAlchemy connection for API runtime.
- User, lab template, and lab instance models.
- Startup table creation and seed data for one Juice Shop template.
- Cognito register, login, email confirmation, and refresh flows.
- Cognito JWT middleware with JWKS fetching and issuer validation.
- User DB row creation/linking on login.
- Authenticated catalog endpoints.
- Authenticated lab start, active list, status, config download, and teardown endpoints.
- Credit deduction on lab start.
- SQS-backed Celery configuration.
- Provision and destroy worker task modules.
- Dockerfile for API.
- Dockerfile for worker.
- Docker Compose stack for local API, worker, and dev Postgres.

### In Progress

- End-to-end worker consumption from SQS in the target AWS account.
- CDK lab stack implementation and validation.
- Final production networking path to Aurora from the API/worker runtime.
- Moving lab runtime toward ECS/Fargate instead of the transitional EC2-shaped MVP outputs.
- Operational hardening: migrations, observability, retries, idempotency, and cleanup automation.

### Next

- Replace startup `create_all` with Alembic migrations before production rollout.
- Finish the first CDK-backed lab stack and verify full provision/status/config/destroy flow.
- Add payment or credit top-up flow.
- Add admin/template management workflow.
- Add automatic TTL expiry teardown.
- Add Phase 2 custom topology builder.
- Add Phase 3 Docker upload and image scanning pipeline.
- Add CI checks and deployment pipeline.

## Contribution Notes

- Do not commit `.env` or AWS credentials.
- Keep production configuration in environment variables, not source code.
- API code should use async SQLAlchemy sessions from `app.database`.
- Celery workers should use synchronous SQLAlchemy engines and sessions.
- Any endpoint that returns user, catalog, or lab data should require Cognito auth unless it is explicitly public.
- Do not log access tokens, refresh tokens, passwords, WireGuard keys, VPN configs, or CDK command output that may contain secrets.
- Every boto3, database, and subprocess interaction should have explicit error handling.
- Keep user-facing lab operations idempotent where possible; retries are normal in SQS/Celery workflows.
- Update this README when endpoint behavior, AWS resources, environment variables, or deployment expectations change.
