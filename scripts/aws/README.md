# AWS Deployment Assets

This folder contains version-controlled AWS inputs used by the setup and deployment scripts. It keeps resource definitions close to the code without mixing them into the executable shell scripts.

Current contents:

- `task-definitions/`: ECS/Fargate task definitions for the API and Celery worker.
- `iam/`: IAM role manifests and trust policies used by ECS tasks.
- `security-groups/`: security group inventory and ingress rule documentation.
- `ecs/`: ECS service and network configuration manifests.
- `ecr/`: ECR repository names and image source mapping.
- `logs/`: CloudWatch log group inventory.
- `secrets/`: Secrets Manager metadata without secret values.

Future use:

- Add load balancer, target group, listener, and autoscaling JSON here when the public API moves behind an ALB.
- Add least-privilege inline IAM policies here before replacing the current broad managed policies.
- Do not commit secrets, passwords, access keys, or generated runtime environment values in this folder.
