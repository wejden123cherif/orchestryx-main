# AWS Deployment Assets

This folder contains version-controlled AWS inputs used by the legacy/manual setup scripts. It keeps resource definitions close to the code without mixing them into executable shell scripts.

These manifests are now legacy/manual infrastructure references. The long-lived platform foundation is owned by `infra/platform_cdk/`; keep these files for comparison and migration until the CDK app has imported or replaced the live resources safely.

The app deploy scripts do not consume these manifests. `scripts/linux/deploy.sh`
and `scripts/windows/deploy.ps1` read CDK-exported environment values, push
images to ECR, and update existing ECS services only.

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
