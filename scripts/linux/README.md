# Linux Scripts

This folder contains Bash scripts for Linux, macOS, WSL, and CI environments.

Current contents:

- `deploy.sh`: builds and pushes API and worker images, then updates existing ECS services created by platform CDK.
- `setup-aws.sh`: legacy/manual AWS setup reference for ECR, ECS, IAM, security groups, logs, Secrets Manager, task definitions, and services. Prefer `infra/platform_cdk/`.

Future use:

- Add CI-friendly release tagging, smoke tests, and migration commands here.
- Keep scripts safe to rerun and avoid hard-coded local machine paths.
