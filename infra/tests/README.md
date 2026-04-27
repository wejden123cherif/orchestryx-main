# Infra Tests

This folder contains tests for the CDK app under `infra/`.

Current contents:

- `unit/`: CDK assertion tests for synthesized templates.

Future use:

- Add template assertions for network isolation, IAM scope, Secrets Manager usage, ECS/Fargate resources, and required stack outputs.
- Keep tests offline where possible; deployment validation should live in a separate integration workflow.
