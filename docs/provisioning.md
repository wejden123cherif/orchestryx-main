# Web Lab Provisioning

This document describes the current Orchestryx lab lifecycle contract. Lab runtime provisioning is private ECS Fargate plus WireGuard when `LAB_RUNTIME_ENABLED=true`.

## Status Model

Lab instances use these statuses:

| Status | Meaning |
|---|---|
| `QUEUED` | API accepted the start request, deducted credits, wrote the lab row, and queued Celery work. |
| `PROVISIONING` | A worker is creating task definitions and network isolation. |
| `STARTING` | Runtime resources exist and the lab task is becoming reachable over WireGuard/private routing. |
| `READY` | The lab ECS task is running and private access metadata is available. |
| `DESTROYING` | Teardown has been requested or queued. |
| `STOPPED` | Cloud resources and generated secrets are cleaned up. |
| `EXPIRED` | TTL elapsed; teardown is queued. |
| `FAILED` | Provisioning failed or timed out. Credits are refunded when provisioning fails. |

Legacy `RUNNING` rows are returned to clients as `READY`; legacy `DESTROYED` rows are returned as `STOPPED`.

## Start Behavior

`POST /labs/start` returns `501 Not Implemented` while `LAB_RUNTIME_ENABLED=false`. When enabled, the API deducts credits, creates the lab row, and dispatches Celery work.

## Start Flow

1. Frontend calls `POST /labs/start` with a `template_id`.
2. API validates the Cognito JWT and loads the database user.
3. API blocks disabled users and enforces `LAB_MAX_ACTIVE_PER_USER` or the user override.
4. API validates the template, checks credits server-side, deducts credits, and writes a `CreditTransaction`.
5. API creates a `LabInstance` as `QUEUED` with progress and status text.
6. API writes a `LabEvent` and dispatches `workers.provision.provision_lab`.
7. Worker sets `PROVISIONING`, registers an ECS task definition, creates a per-lab SG, and registers the WireGuard peer through SSM.
8. Worker runs the Fargate task in private subnets with no public IP, waits for `RUNNING`, stores access metadata, and sets `READY`.
9. UI polls `/labs/{id}/status` and `/labs/{id}/events` to show progress.

## Stop And Cleanup

- `DELETE /labs/{id}` stops user-owned labs.
- Queued labs with no stack are cancelled directly and marked `STOPPED`.
- Started labs are marked `DESTROYING` and passed to `workers.destroy.destroy_lab`.
- `destroy_expired_labs` queues teardown for `READY` labs past `expires_at`.
- `fail_stale_provisioning_labs` marks stuck `QUEUED`, `PROVISIONING`, or `STARTING` labs as `FAILED` and refunds credits.

## Runtime Notes

The removed per-lab EC2 CDK app is intentionally not used. Lab tasks are not public, are not attached to the API ALB, and are cleaned up by explicit stop, TTL expiry, stale provisioning failure, and periodic ECS status polling.
