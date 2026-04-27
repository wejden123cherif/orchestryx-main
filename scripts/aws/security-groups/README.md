# Security Groups

This folder documents the security groups and ingress rules used by the current ECS/Aurora deployment.

Current contents:

- `security-groups.json`: VPC, security group IDs, and ingress rules for API, worker, and Aurora access.

Future use:

- Add ALB security groups and narrow the API task security group to ALB-only ingress.
- Remove public API task ingress after the API service is fronted by a load balancer.
- Split dev, staging, and production security group manifests if separate AWS accounts are introduced.
