# Web Lab Provisioning

This document describes the current Orchestryx web-lab lifecycle and the production controls around it.

## Status Model

Lab instances use these statuses:

| Status | Meaning |
|---|---|
| `QUEUED` | API accepted the start request, deducted credits, wrote the lab row, and queued Celery work. |
| `PROVISIONING` | A worker is creating AWS resources and generating access material. |
| `STARTING` | CloudFormation completed and the EC2 lab host is passing startup/readiness checks. |
| `READY` | The VPN config is stored and the challenge URL is available over WireGuard. |
| `DESTROYING` | Teardown has been requested or queued. |
| `STOPPED` | Cloud resources and generated secrets are cleaned up. |
| `EXPIRED` | TTL elapsed; teardown is queued. |
| `FAILED` | Provisioning failed or timed out. Credits are refunded when provisioning fails. |

Legacy `RUNNING` rows are returned to clients as `READY`; legacy `DESTROYED` rows are returned as `STOPPED`.

## Start Flow

1. Frontend calls `POST /labs/start` with a `template_id`.
2. API validates the Cognito JWT and loads the database user.
3. API blocks disabled users and enforces `LAB_MAX_ACTIVE_PER_USER` or the user override.
4. API validates the template, checks credits server-side, deducts credits, and writes a `CreditTransaction`.
5. API creates a `LabInstance` as `QUEUED` with progress and status text.
6. API writes a `LabEvent` and dispatches `workers.provision.provision_lab`.
7. Worker sets `PROVISIONING`, generates WireGuard keys, deploys the CDK stack, then sets `STARTING`.
8. Worker waits for EC2 instance status checks, stores the VPN config in Secrets Manager, and sets `READY`.
9. UI polls `/labs/{id}/status` and `/labs/{id}/events` to show progress.

## Stop And Cleanup

- `DELETE /labs/{id}` stops user-owned labs.
- Queued labs with no stack are cancelled directly and marked `STOPPED`.
- Started labs are marked `DESTROYING` and passed to `workers.destroy.destroy_lab`.
- `destroy_expired_labs` queues teardown for `READY` labs past `expires_at`.
- `fail_stale_provisioning_labs` marks stuck `QUEUED`, `PROVISIONING`, or `STARTING` labs as `FAILED`, refunds credits, and queues cleanup for partial stacks.

## Speed Notes

The current MVP still provisions a fresh VPC and EC2 host per lab, then installs Docker, WireGuard, AWS CLI, and pulls the challenge image in user data. That gives strong isolation, but it is the main startup-time cost.

Practical next optimizations:

- Build a golden AMI with Docker, WireGuard, AWS CLI, CloudFormation helper tooling, and common images pre-pulled.
- Pin lab images by immutable digest instead of `latest` to avoid surprise pulls and cache misses.
- Keep a small warm pool of stopped/pre-created lab hosts for popular templates.
- Move single-container web labs to ECS/Fargate plus a shared VPN or per-user gateway once network isolation is designed.
- Add CloudFormation creation signals from user data so `READY` means app-level readiness, not only EC2 status checks.
