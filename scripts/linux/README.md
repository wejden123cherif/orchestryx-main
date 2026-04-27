# Linux Scripts

This folder contains Bash scripts for Linux, macOS, WSL, and CI environments.

Current contents:

- `deploy.sh`: builds and pushes API and worker images, then forces ECS service redeployments.
- `setup-aws.sh`: idempotent one-time AWS setup for ECR, ECS, IAM, security groups, logs, Secrets Manager, task definitions, and services.

Future use:

- Add CI-friendly release tagging, smoke tests, and migration commands here.
- Keep scripts safe to rerun and avoid hard-coded local machine paths.
