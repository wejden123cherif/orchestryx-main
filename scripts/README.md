# Scripts

This folder contains operational scripts for Orchestryx deployment and AWS setup.

Current contents:

- `deploy.sh`: Linux/macOS/CI script that builds API and worker images, pushes them to ECR, and forces ECS redeployments.
- `deploy.ps1`: Windows PowerShell equivalent of `deploy.sh`.
- `setup-aws.sh`: Linux/macOS/CI one-time AWS setup script. It is idempotent and safe to rerun.
- `setup-aws.ps1`: Windows PowerShell equivalent of `setup-aws.sh`.
- `aws/`: version-controlled AWS deployment assets grouped by service area.

AWS asset folders:

- `aws/task-definitions/`: ECS task definition inputs for the FastAPI API and Celery worker services.
- `aws/iam/`: ECS trust policy, role inventory, and managed policy attachment documentation.
- `aws/security-groups/`: security group IDs and ingress rule documentation.
- `aws/ecs/`: ECS service network configuration and task family references.
- `aws/ecr/`: ECR repository inventory.
- `aws/logs/`: CloudWatch log group inventory.
- `aws/secrets/`: Secrets Manager metadata without committed secret values.

Future use:

- Add migration, smoke-test, image scanning, and release tagging scripts here.
- Keep scripts idempotent where possible and document destructive operations clearly.
