# ECS Fargate Lab Runtime

This runtime launches common challenge containers as private ECS Fargate tasks.
It does not create per-lab CloudFormation stacks, public lab endpoints, public
task IPs, scoring, dynamic flags, or advanced challenge state.

## Runtime Contract

Required worker/API environment:

- `ORCHESTRYX_ENV`
- `AWS_REGION`
- `AWS_ACCOUNT_ID`
- `AWS_VPC_ID`
- `LAB_RUNTIME_ENABLED=true`
- `LAB_ECS_CLUSTER`
- `LAB_ECS_SUBNET_IDS` - comma-separated private subnet IDs
- `LAB_ECS_SECURITY_GROUP_IDS` - shared egress-only lab SG
- `LAB_ECS_TASK_EXECUTION_ROLE_ARN`
- `LAB_ECS_TASK_ROLE_ARN` - optional but provided by CDK
- `LAB_ECS_LOG_GROUP`
- `LAB_ECS_LOG_STREAM_PREFIX`
- `LAB_ECS_CPU`
- `LAB_ECS_MEMORY_MIB`
- `LAB_ECS_ASSIGN_PUBLIC_IP=false`
- `LAB_ECS_PUBLIC_ACCESS_ENABLED=false`
- `ORCHESTRYX_WIREGUARD_INSTANCE_ID`
- `ORCHESTRYX_WIREGUARD_SECURITY_GROUP_ID`
- `LAB_VPN_CONFIG_SECRET_ID` or `LAB_VPN_CONFIG_INLINE`

`export_env.py` exports the VPC, ECS, queue, DNS, and WireGuard output names for
local tooling. ECS task definitions receive the canonical names above directly
from `EcsPlatformStack`.

## Provisioning Flow

1. `POST /labs/start` validates auth, credits, active limits, and template state.
2. API creates `lab_instances` as `QUEUED` and dispatches the Celery SQS task.
3. Worker registers an ECS Fargate task definition from `LabTemplate.docker_image_uri`.
4. Worker generates a WireGuard peer and resolves `ORCHESTRYX_WIREGUARD_INSTANCE_ID`.
5. Worker creates a per-lab SG allowing only `tcp/{challenge_port}` from that peer `/32`.
6. Worker registers the WireGuard peer through SSM Run Command.
7. Worker runs one Fargate task in private subnets with `assignPublicIp=DISABLED`.
8. Worker polls ECS until `RUNNING`, stores ENI/private IP/log metadata, renders VPN config, and marks `READY`.
9. `DELETE /labs/{id}` or TTL cleanup revokes the VPN peer, stops the ECS task, deletes the per-lab SG, and marks `STOPPED`.

## Minimal Template Shape

The current database model already supports the minimum common container fields:

- `id`, `title`, `category`, `difficulty`, `description`
- `docker_image_uri`
- `challenge_port`
- `challenge_path`
- `ttl_hours`
- `is_active`

CPU and memory currently come from runtime defaults (`LAB_ECS_CPU`,
`LAB_ECS_MEMORY_MIB`). Template-level sizing should be a later migration only
when needed.

## Network Rules

- Lab tasks run only in private subnets.
- Lab tasks must never receive public IPs.
- The shared lab SG has no inbound rules.
- Each lab gets a per-lab SG with one inbound rule: `tcp/{challenge_port}` from the assigned WireGuard peer IP `/32`.
- WireGuard runs in routed mode so the VPN client IP is preserved to the lab ENI.
- Private subnet route tables include `10.8.0.0/16 -> WireGuard gateway instance`.

## Worker IAM

The worker task role needs:

- ECS: `ecs:RegisterTaskDefinition`, `ecs:RunTask`, `ecs:StopTask`, `ecs:DescribeTasks`, `ecs:DescribeTaskDefinition`
- IAM: `iam:PassRole` for the lab execution role and lab task role
- EC2: `ec2:CreateSecurityGroup`, `ec2:AuthorizeSecurityGroupIngress`, `ec2:AuthorizeSecurityGroupEgress`, `ec2:RevokeSecurityGroupIngress`, `ec2:RevokeSecurityGroupEgress`, `ec2:DeleteSecurityGroup`, `ec2:DescribeSecurityGroups`, `ec2:DescribeSubnets`, `ec2:DescribeVpcs`, `ec2:DescribeInstances`, `ec2:DescribeNetworkInterfaces`, `ec2:CreateTags`
- SSM: `ssm:SendCommand` to `AWS-RunShellScript` and tagged WireGuard gateway instances, `ssm:GetCommandInvocation`, `ssm:ListCommandInvocations`
- Logs: `logs:CreateLogGroup`, `logs:GetLogEvents`, `logs:DescribeLogStreams`
- Secrets Manager: `secretsmanager:GetSecretValue` for runtime/VPN config

The WireGuard EC2 role needs `AmazonSSMManagedInstanceCore`. The gateway must be
able to reach SSM over HTTPS, either through its public subnet internet route,
NAT, or VPC endpoints.

## Deploy Commands

From `infra/platform_cdk`:

```bash
cdk synth -c env=dev
cdk diff OrchestryxDev-VpnStack -c env=dev
cdk diff OrchestryxDev-EcsPlatformStack -c env=dev
cdk deploy OrchestryxDev-VpnStack OrchestryxDev-EcsPlatformStack -c env=dev --outputs-file cdk-outputs-dev.json
python export_env.py --env dev --outputs-file cdk-outputs-dev.json
```

Then rebuild/redeploy the worker image and force a new worker deployment:

```bash
ORCHESTRYX_ENV=dev ./scripts/linux/deploy.sh worker
aws ecs update-service --cluster orchestryx-dev --service orchestryx-dev-worker-service --force-new-deployment --region "$AWS_REGION"
```

PowerShell equivalent:

```powershell
$env:ORCHESTRYX_ENV = "dev"
.\scripts\windows\deploy.ps1 worker
aws ecs update-service --cluster orchestryx-dev --service orchestryx-dev-worker-service --force-new-deployment --region $env:AWS_REGION
```

## Verification

Check SSM gateway registration:

```bash
aws ssm describe-instance-information --region "$AWS_REGION" \
  --filters Key=InstanceIds,Values="$ORCHESTRYX_WIREGUARD_INSTANCE_ID"
```

Smoke test SSM Run Command:

```bash
CMD_ID=$(aws ssm send-command --region "$AWS_REGION" \
  --instance-ids "$ORCHESTRYX_WIREGUARD_INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --parameters commands='["systemctl is-active amazon-ssm-agent && wg show wg0"]' \
  --query 'Command.CommandId' --output text)

aws ssm get-command-invocation --region "$AWS_REGION" \
  --command-id "$CMD_ID" \
  --instance-id "$ORCHESTRYX_WIREGUARD_INSTANCE_ID"
```

Inspect worker logs:

```bash
aws logs tail /ecs/orchestryx-dev-worker --since 30m --follow --region "$AWS_REGION"
```

Launch one lab through the API or UI, then verify ECS:

```bash
aws ecs list-tasks --cluster "$ORCHESTRYX_ECS_CLUSTER_NAME" --region "$AWS_REGION"
aws ecs describe-tasks --cluster "$ORCHESTRYX_ECS_CLUSTER_NAME" \
  --tasks "<task-arn>" --region "$AWS_REGION"
```

Inspect lab security groups:

```bash
aws ec2 describe-security-groups --region "$AWS_REGION" \
  --filters Name=tag:OrchestryxManaged,Values=true Name=tag:ManagedBy,Values=orchestryx-worker
```

Destroy the lab through `DELETE /labs/{instance_id}` or the UI, then confirm:

```bash
aws ecs describe-tasks --cluster "$ORCHESTRYX_ECS_CLUSTER_NAME" \
  --tasks "<task-arn>" --region "$AWS_REGION" \
  --query 'tasks[0].lastStatus'

aws ec2 describe-security-groups --region "$AWS_REGION" \
  --filters Name=tag:LabInstanceId,Values="<instance-id>"
```

## Manual Cleanup

For a failed lab:

```bash
aws ecs stop-task --cluster "$ORCHESTRYX_ECS_CLUSTER_NAME" \
  --task "<task-arn>" --reason "manual failed lab cleanup" --region "$AWS_REGION"

aws ec2 delete-security-group --group-id "<per-lab-sg-id>" --region "$AWS_REGION"
```

If the peer was added and destroy cannot reach the gateway, remove it manually:

```bash
aws ssm send-command --region "$AWS_REGION" \
  --instance-ids "$ORCHESTRYX_WIREGUARD_INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --parameters commands='["wg set wg0 peer <public-key> remove && wg-quick save wg0"]'
```
