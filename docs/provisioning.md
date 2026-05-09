# Web Lab Provisioning

This document describes the current Orchestryx lab lifecycle contract. Lab runtime provisioning is disabled in this build while the platform is made reproducible through `infra/platform_cdk/`.

## Status Model

Lab instances use these statuses:

| Status | Meaning |
|---|---|
| `QUEUED` | API accepted the start request, deducted credits, wrote the lab row, and queued Celery work. Not used while runtime is disabled. |
| `PROVISIONING` | A worker is creating runtime resources. Not used while runtime is disabled. |
| `STARTING` | Runtime resources exist and the lab is becoming reachable. Not used while runtime is disabled. |
| `READY` | The lab is reachable. Not used while runtime is disabled. |
| `DESTROYING` | Teardown has been requested or queued. |
| `STOPPED` | Cloud resources and generated secrets are cleaned up. |
| `EXPIRED` | TTL elapsed; teardown is queued. |
| `FAILED` | Provisioning failed or timed out. Credits are refunded when provisioning fails. |

Legacy `RUNNING` rows are returned to clients as `READY`; legacy `DESTROYED` rows are returned as `STOPPED`.

## Current Start Behavior

`POST /labs/start` returns `501 Not Implemented` while `LAB_RUNTIME_ENABLED=false`. The API checks this before deducting credits, creating a lab row, or dispatching Celery work.

## Future Start Flow

1. Frontend calls `POST /labs/start` with a `template_id`.
2. API validates the Cognito JWT and loads the database user.
3. API blocks disabled users and enforces `LAB_MAX_ACTIVE_PER_USER` or the user override.
4. API validates the template, checks credits server-side, deducts credits, and writes a `CreditTransaction`.
5. API creates a `LabInstance` as `QUEUED` with progress and status text.
6. API writes a `LabEvent` and dispatches `workers.provision.provision_lab`.
7. Worker sets `PROVISIONING` and creates runtime resources.
8. Worker waits for runtime readiness, stores any required access material, and sets `READY`.
9. UI polls `/labs/{id}/status` and `/labs/{id}/events` to show progress.

## Stop And Cleanup

- `DELETE /labs/{id}` stops user-owned labs.
- Queued labs with no stack are cancelled directly and marked `STOPPED`.
- Started labs are marked `DESTROYING` and passed to `workers.destroy.destroy_lab`.
- `destroy_expired_labs` queues teardown for `READY` labs past `expires_at`.
- `fail_stale_provisioning_labs` marks stuck `QUEUED`, `PROVISIONING`, or `STARTING` labs as `FAILED` and refunds credits.

## Runtime Notes

The removed per-lab EC2 CDK app is intentionally not used. The next runtime should be designed against the platform CDK foundation, with explicit choices for networking, image deployment, access controls, and cleanup before any production migration.
