# CDK Constructs

This package contains the Python CDK constructs and stacks used by the Orchestryx lab provisioning worker.

Current contents:

- `orchestryx_infra_stack.py`: MVP lab stack that creates an isolated lab network, runtime instance, WireGuard access path, tags, and CloudFormation outputs read by the worker.

Future use:

- Split shared network, access, compute, and template-specific constructs as the lab system grows.
- Move from transitional EC2-shaped outputs toward ECS/Fargate-backed lab runtimes where practical.
- Keep stack inputs driven by CDK context from `workers/provision.py`.
