# Cost Optimization

Orchestryx spends money when platform infrastructure exists, when containers run, and when supporting AWS services are always on.

## Implemented Controls

- User starts are limited by `LAB_MAX_ACTIVE_PER_USER` unless a user-specific override is set.
- Each template has a TTL and each instance gets an `expires_at`.
- Celery Beat marks expired `READY` labs for cleanup every five minutes.
- Stale startup cleanup fails timed-out provisioning jobs and refunds credits.
- Credit balance is enforced by the API, not the frontend.
- Credit changes are recorded in `credit_transactions`.
- Platform CDK resources are tagged by stack and environment.

## Current Cost Model

The active cost model is the platform itself:

- VPC, subnets, NAT gateway settings from `infra/platform_cdk/config/*.yaml`.
- ECR repositories for API and worker images.
- SQS queues for async work.
- Cognito user pool and client.
- CloudWatch log groups.
- Optional PostgreSQL/Aurora, ECS services, DNS, and VPN foundation when enabled.

Lab runtime costs are not active while `LAB_RUNTIME_ENABLED=false`.

## Recommended Next Steps

- Keep dev/staging database and ECS services disabled until needed.
- Deploy low-risk platform stacks first: network, ECR, queues, auth, observability, private DNS.
- Replace broad legacy/manual worker IAM policies with the platform CDK roles as ECS migration proceeds.
- Add per-user monthly credit budgets and admin-visible usage aggregation.
- Add orphan-resource reconciliation once a new lab runtime exists.
