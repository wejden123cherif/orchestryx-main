# Scripts

This folder contains operational scripts for Orchestryx deployment and AWS setup.

Current contents:

- `linux/`: Bash scripts for Linux, macOS, WSL, and CI.
- `windows/`: PowerShell scripts for Windows teammates.
- `aws/`: version-controlled AWS deployment assets grouped by service area.

OS-specific scripts:

- `linux/deploy.sh`: builds API and worker images, pushes them to ECR, and forces ECS redeployments.
- `linux/setup-aws.sh`: idempotent one-time AWS setup script for Bash environments.
- `windows/deploy.ps1`: PowerShell equivalent of the Bash deploy script.
- `windows/setup-aws.ps1`: PowerShell equivalent of the Bash setup script.

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
