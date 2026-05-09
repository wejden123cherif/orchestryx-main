# Architecture

Orchestryx is split into API, worker, infrastructure, operations, and documentation layers.

## Components

| Component | Location | Responsibility |
|---|---|---|
| FastAPI API | `apps/api/` | Auth, catalog, user profile, lab lifecycle HTTP endpoints |
| Celery workers | `workers/` | Run asynchronous background services and disabled lab-runtime lifecycle tasks |
| Database | Aurora/PostgreSQL | Users, lab templates, lab instances, lifecycle state |
| Cognito | AWS | User registration, login, token issuance, JWT verification |
| SQS | AWS | Celery broker queues for provision and destroy jobs |
| Platform CDK app | `infra/platform_cdk/` | Long-lived platform infrastructure |
| Secrets Manager | AWS | Runtime environment secret |
| ECS/Fargate | AWS | API and worker runtime |
| ECR | AWS | API and worker images |
| AWS Status CLI | `scripts/aws/status.py` | Local operator view over AWS resources, costs, logs, and lab stacks |

## Runtime Flow

```text
User
  |
  | HTTP + Cognito bearer token
  v
FastAPI API
  |
  | async SQLAlchemy
  v
Aurora/PostgreSQL
  |
  | Celery task message
  v
Amazon SQS
  |
  | worker consumes
  v
Celery worker
  |
  | sync SQLAlchemy status updates
  | disabled lab-runtime path
  v
Database lifecycle state
```

## Lab Start Flow

```text
POST /labs/start
  -> validate Cognito JWT
  -> load user and template
  -> return 501 while LAB_RUNTIME_ENABLED=false
```

When a new lab runtime is implemented, this flow can be re-enabled behind an explicit runtime contract. The old per-lab EC2 CDK app has been removed and should not be assumed by API or worker code.

## Lab Destroy Flow

```text
DELETE /labs/{instance_id}
  -> validate Cognito JWT
  -> verify lab ownership
  -> set lab_instances row to STOPPED if still queued, otherwise DESTROYING
  -> enqueue destroy_lab(instance_id)
  -> worker updates lab_instances row to STOPPED
```

## Lifecycle And Observability

The database owns lifecycle truth. `lab_instances` stores current status,
progress, status message, failure reason, retry count, stack name, IP, secret
key, and timestamps. `lab_events` is append-only and records important
provisioning, retry, timeout, failure, expiry, and teardown events. The user UI
polls status/events for live feedback; the admin console reads the same data for
operations.

## Database Boundary

The API uses async SQLAlchemy sessions from `apps.api.database`. Celery tasks use sync SQLAlchemy engines and sessions because Celery tasks are synchronous in this codebase. Keep that boundary intact unless the worker execution model is changed deliberately.

## Deployment Boundary

`scripts/linux/` and `scripts/windows/` contain operator scripts. `scripts/aws/` contains version-controlled AWS input JSON and resource manifests. Runtime application code should not import from `scripts/`.

## Security Boundary

Public endpoints are limited to health and auth flows. User, catalog, and lab endpoints require Cognito JWT validation. Sensitive values such as passwords, tokens, runtime access configs, and generated secret strings must not be logged or committed.
