# Linux Scripts Summary

This folder contains Bash scripts for Linux, macOS, WSL, and CI.

Key files:

- `deploy.sh`: build/push API and worker images, then force ECS redeployments.
- `setup-aws.sh`: idempotent AWS environment setup.

Future use:

- Keep CI-oriented deployment logic here and avoid Windows-specific assumptions.
