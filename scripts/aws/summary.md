# AWS Assets Summary

This folder contains version-controlled AWS manifests and CLI input files.

Key folders:

- `task-definitions/`: ECS task definitions.
- `iam/`: IAM roles and trust policy manifests.
- `security-groups/`: security group inventory.
- `ecs/`: ECS service placement inventory.
- `ecr/`: ECR repository inventory.
- `logs/`: CloudWatch log group inventory.
- `secrets/`: Secrets Manager metadata without secret values.

Future use:

- Add ALB, target group, listener, autoscaling, and alarm manifests as infrastructure matures.
