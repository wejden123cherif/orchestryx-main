# ECS Fargate Lab Runtime

This document scopes only the replacement lab deployment mechanism. The API,
authentication, frontend, database foundation, queues, shared VPC, ECR, and ECS
cluster remain owned by the existing platform architecture.

## Architecture

Labs run as one-off ECS Fargate tasks launched by the Celery worker with boto3.
Runtime provisioning does not call CDK, CloudFormation, SSH, EC2, WireGuard, or
per-lab VPC provisioning. Each `lab_templates.docker_image_uri` is converted into
an ECS task definition revision, then `RunTask` starts one isolated `awsvpc`
Fargate task in the shared private subnets and lab security group.

The worker persists ECS metadata on `lab_instances`: task ARN, task definition
ARN, ECS status, log group/stream, ENI, private/public IPs, stop reason, and
start/stop timestamps. The existing lab status model remains the API contract:
`QUEUED -> PROVISIONING -> STARTING -> READY -> DESTROYING -> STOPPED`, with
`FAILED` and `EXPIRED` for terminal error/TTL states.

## Lifecycle

1. `POST /labs/start` validates auth, credits, active limits, and template.
2. The API creates a `lab_instances` row and dispatches `workers.provision.provision_lab`.
3. The worker registers an ECS Fargate task definition for the template image.
4. The worker calls `ecs.run_task` in the shared cluster/subnets/security group.
5. The worker polls `ecs.describe_tasks` until the task reaches `RUNNING`.
6. The worker stores CloudWatch log stream and ENI metadata, then marks the lab `READY`.
7. `DELETE /labs/{id}` or TTL cleanup dispatches `workers.destroy.destroy_lab`.
8. Destroy calls `ecs.stop_task`, polls until stopped, and marks the row `STOPPED`.

## API Surface

Existing endpoints remain compatible:

- `POST /labs/start`
- `GET /labs/active`
- `GET /labs/{instance_id}/status`
- `GET /labs/{instance_id}/events`
- `DELETE /labs/{instance_id}`

Added lab-runtime-only endpoint:

- `GET /labs/{instance_id}/logs` reads the owning user's ECS task log stream from
  CloudWatch Logs.

`challenge_url` is built from ECS task IP metadata and the template's
`challenge_port`/`challenge_path`. Public exposure is disabled by default; private
IP URLs require private network reachability. If public exposure is enabled later,
the lab security group and `LAB_ECS_ASSIGN_PUBLIC_IP`/`LAB_ECS_PUBLIC_ACCESS_ENABLED`
must be configured deliberately.

## Worker Strategy

- `workers/provision.py`: register task definition, run task, poll startup,
  persist runtime metadata, refund credits on provisioning failure.
- `workers/destroy.py`: stop task, poll stop state, TTL cleanup, stale-start
  timeout handling, periodic status refresh.
- `workers/celery_app.py`: keeps existing SQS broker queues and adds a scheduled
  ECS task polling job.

## Minimal CDK Support

The existing ECS platform stack now provides only shared runtime support:

- CloudWatch log group for lab tasks.
- Security group for ephemeral lab tasks.
- Lab task role with no broad AWS permissions by default.
- Worker IAM permissions for ECS task lifecycle, ENI description, CloudWatch log
  reads, and `iam:PassRole` for the execution/lab task roles.
- Worker environment variables for cluster, subnets, security groups, roles, log
  group, CPU, and memory.

No per-lab CDK stacks are created at runtime.

## Security

- Tenant isolation is by ECS task, ENI, security group, per-lab environment, and
  database ownership checks on every endpoint.
- Workers pass only bounded runtime environment values into challenge containers:
  instance ID, template ID, user ID, and dynamic flag.
- Task roles are separate from worker/API roles. Lab containers should receive
  least-privilege task roles; default CDK role grants no application AWS access.
- Cleanup protects against abandoned tasks through TTL expiry, stale provisioning
  failure, explicit stop, and periodic ECS status polling.
- CloudWatch log retrieval is owner-gated through the API.

## Cost And Operations

- Fargate tasks run only for the lab TTL or until user stop.
- No NAT-heavy per-lab VPC creation, EC2 instances, or CloudFormation stacks are
  created during lab start.
- Keep CPU/memory defaults small and raise only per template when template-level
  sizing is added.
- Use short CloudWatch retention for dev/staging and bounded prod retention.
- Add ECS service quotas/concurrency alarms as lab volume grows.

## Observability

- Lab lifecycle events stay in `lab_events`.
- ECS task state and stop reasons are persisted on `lab_instances`.
- Container stdout/stderr goes to the configured lab CloudWatch log group.
- The `/labs/{id}/logs` endpoint exposes recent log events for the owning user.
