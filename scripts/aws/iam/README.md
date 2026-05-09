# IAM Inputs

This folder contains IAM role documentation and policy inputs for the ECS deployment.

Current contents:

- `ecs-task-trust-policy.json`: trust policy that lets ECS tasks assume task roles.
- `roles.json`: role inventory, managed policy attachments, and intended purpose for each role.

Future use:

- Replace broad AWS managed policies with scoped custom policies for SQS and the platform resources each service actually uses.
- Add permissions boundaries when the deployment is split across separate dev, staging, and production accounts.
- Keep IAM inputs reviewed carefully because these files define the AWS blast radius of the platform.
