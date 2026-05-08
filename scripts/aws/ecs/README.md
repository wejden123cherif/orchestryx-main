# ECS Service Manifests

This folder documents ECS services and network placement for the API and worker workloads.

Current contents:

- `services.json`: cluster, public API ALB, target group, service names, task families, subnets, security groups, and public IP settings.

The API service is attached to `orchestryx-api-tg` behind the internet-facing
`orchestryx-api-alb`. The load balancer listens on HTTP port `80` and forwards
to the API container on port `8000`; `/health` is the target group health check.

Future use:

- Add HTTPS, ACM certificate wiring, and DNS aliases.
- Add autoscaling targets and CloudWatch alarms.
- Split service manifests by environment once staging and production are separated.
