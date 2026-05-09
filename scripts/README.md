# Scripts

This folder contains operational scripts for Orchestryx deployment and AWS setup.

Current contents:

- `linux/`: Bash scripts for Linux, macOS, WSL, and CI.
- `windows/`: PowerShell scripts for Windows teammates.
- `aws/`: version-controlled AWS deployment assets grouped by service area.

OS-specific scripts:

- `linux/deploy.sh`: builds API and worker images, pushes them to CDK-created ECR repositories, and updates existing ECS services.
- `linux/setup-aws.sh`: legacy/manual AWS bootstrap reference. Prefer `infra/platform_cdk/`.
- `windows/deploy.ps1`: PowerShell equivalent of the Bash app deploy script.
- `windows/setup-aws.ps1`: legacy/manual AWS bootstrap reference. Prefer `infra/platform_cdk/`.

AWS asset folders:

- `aws/task-definitions/`: ECS task definition inputs for the FastAPI API and Celery worker services.
- `aws/iam/`: ECS trust policy, role inventory, and managed policy attachment documentation.
- `aws/security-groups/`: security group IDs and ingress rule documentation.
- `aws/ecs/`: ECS service network configuration and task family references.
- `aws/ecr/`: ECR repository inventory.
- `aws/rds/`: Aurora PostgreSQL database inventory.
- `aws/logs/`: CloudWatch log group inventory.
- `aws/secrets/`: Secrets Manager metadata without committed secret values.

Future use:

- Add migration, smoke-test, image scanning, and release tagging scripts here.
- Keep scripts idempotent where possible and document destructive operations clearly.
