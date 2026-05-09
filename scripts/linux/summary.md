# Linux Scripts Summary

This folder contains Bash scripts for Linux, macOS, WSL, and CI.

Key files:

- `deploy.sh`: build/push API and worker images, then update existing ECS services.
- `setup-aws.sh`: legacy/manual AWS environment setup reference.

Future use:

- Keep CI-oriented deployment logic here and avoid Windows-specific assumptions.
