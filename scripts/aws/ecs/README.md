# ECS Service Manifests

This folder documents ECS services and network placement for the API and worker workloads.

Current contents:

- `services.json`: cluster, service names, task families, subnets, security groups, and public IP settings.

Future use:

- Add Application Load Balancer configuration and service discovery details.
- Add autoscaling targets and CloudWatch alarms.
- Split service manifests by environment once staging and production are separated.
