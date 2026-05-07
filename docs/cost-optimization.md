# Cost Optimization

Orchestryx spends money when lab infrastructure exists, when containers pull images, and when supporting AWS services are always on.

## Implemented Controls

- User starts are limited by `LAB_MAX_ACTIVE_PER_USER` unless a user-specific override is set.
- Each template has a TTL and each instance gets an `expires_at`.
- Celery Beat queues expired `READY` labs for teardown every five minutes.
- Stale startup cleanup fails timed-out provisioning jobs, refunds credits, and queues partial-stack cleanup.
- Credit balance is enforced by the API, not the frontend.
- Credit changes are recorded in `credit_transactions`.
- Lab stacks are tagged with project, instance id, manager, and template image for AWS cost attribution.

## Current Cost Model

Each running lab currently creates:

- One VPC with one public subnet and no NAT gateway.
- One small EC2 instance, usually `t3.small`.
- One encrypted GP3 root volume.
- One security group with WireGuard UDP 51820 exposed.
- One Secrets Manager secret for generated VPN configuration.
- CloudFormation stack state and logs.

This model is isolation-friendly but not the cheapest possible implementation for short web labs because EC2 boot, package installation, and image pulls happen per lab.

## Recommended Next Steps

- Build a hardened golden AMI to remove per-lab package installation.
- Pre-pull common Docker images into the AMI or a local registry cache.
- Add a small warm pool for the most-used web labs.
- Replace broad worker IAM policies with least-privilege stack, EC2, IAM-pass-role, and Secrets Manager policies.
- Add per-user monthly credit budgets and admin-visible usage aggregation.
- Add orphan-resource reconciliation that scans CloudFormation stacks and Secrets Manager for resources without live database rows.
