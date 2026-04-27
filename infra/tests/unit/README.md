# Infra Unit Tests

This folder contains unit-level CDK synthesis tests. These tests should instantiate stacks and assert the generated CloudFormation shape without deploying AWS resources.

Current contents:

- `test_orchestryx_infra_stack.py`: starter test scaffold for the lab stack.

Future use:

- Assert least-privilege IAM, no unintended public exposure, required outputs, tagging, and expected compute/runtime resources.
- Add regression tests before changing CDK constructs used by live provisioning workers.
