# Architecture

Orchestryx is split into API, worker, infrastructure, operations, and documentation layers.

## Components

| Component | Location | Responsibility |
|---|---|---|
| FastAPI API | `apps/api/` | Auth, catalog, user profile, lab lifecycle HTTP endpoints |
| Celery workers | `workers/` | Provision and destroy labs outside request/response flow |
| Database | Aurora/PostgreSQL | Users, lab templates, lab instances, lifecycle state |
| Cognito | AWS | User registration, login, token issuance, JWT verification |
| SQS | AWS | Celery broker queues for provision and destroy jobs |
| CDK app | `infra/` | Lab infrastructure definitions deployed by workers |
| Secrets Manager | AWS | Runtime environment secret and generated VPN configs |
| ECS/Fargate | AWS | API and worker runtime |
| ECR | AWS | API and worker images |
| Cockpit | `cockpit/` | Local operator view over AWS resources, costs, logs, and lab stacks |

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
  | cdk deploy/destroy
  | secretsmanager create/delete
  v
CloudFormation + Secrets Manager
```

## Lab Start Flow

```text
POST /labs/start
  -> validate Cognito JWT
  -> load user and template
  -> check and deduct credits
  -> create lab_instances row with PROVISIONING
  -> enqueue provision_lab(instance_id, template_id, user_id)
  -> worker deploys CDK stack
  -> worker stores WireGuard config in Secrets Manager
  -> worker updates lab_instances row to RUNNING
```

## Lab Destroy Flow

```text
DELETE /labs/{instance_id}
  -> validate Cognito JWT
  -> verify lab ownership
  -> set lab_instances row to DESTROYING
  -> enqueue destroy_lab(instance_id)
  -> worker runs CDK destroy
  -> worker deletes generated VPN secret
  -> worker updates lab_instances row to DESTROYED
```

## Database Boundary

The API uses async SQLAlchemy sessions from `apps.api.database`. Celery tasks use sync SQLAlchemy engines and sessions because Celery tasks are synchronous in this codebase. Keep that boundary intact unless the worker execution model is changed deliberately.

## Deployment Boundary

`scripts/linux/` and `scripts/windows/` contain operator scripts. `scripts/aws/` contains version-controlled AWS input JSON and resource manifests. Runtime application code should not import from `scripts/`.

## Security Boundary

Public endpoints are limited to health and auth flows. User, catalog, and lab endpoints require Cognito JWT validation. Sensitive values such as passwords, tokens, WireGuard keys, VPN configs, and generated secret strings must not be logged or committed.
