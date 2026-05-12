# Troubleshooting Lab Runtime

Lab provisioning is enabled only when `LAB_RUNTIME_ENABLED=true`. The supported
runtime is private ECS Fargate tasks reached through WireGuard.

## Where To Look

1. User lab detail page: current status, progress, `/labs/{id}/events`, and `/labs/{id}/status`.
2. Admin console `/admin`: failed labs, queued labs, status messages, and event log.
3. Worker logs: CloudWatch `/ecs/orchestryx-dev-worker`.
4. ECS task status and stopped reason.
5. SSM gateway command status.

## Common Failure Points

- Worker runtime env is missing `AWS_VPC_ID`, private subnet IDs, lab roles, or `ORCHESTRYX_WIREGUARD_INSTANCE_ID`.
- Worker role cannot `ssm:SendCommand` to `AWS-RunShellScript` or the tagged gateway instance.
- WireGuard gateway is not registered as an SSM managed instance.
- Gateway cannot reach SSM over HTTPS 443.
- Lab template has an empty `docker_image_uri` or invalid `challenge_port`.
- ECR image does not exist or the lab execution role cannot pull it.
- Fargate task stops before `RUNNING`; inspect `stoppedReason` and container logs.
- Per-lab SG deletion is delayed by ENI detachment; cleanup retries, then logs the orphan SG tag.

## Commands

```bash
aws logs tail /ecs/orchestryx-dev-worker --since 30m --follow --region "$AWS_REGION"

aws ssm describe-instance-information --region "$AWS_REGION" \
  --filters Key=InstanceIds,Values="$ORCHESTRYX_WIREGUARD_INSTANCE_ID"

CMD_ID=$(aws ssm send-command --region "$AWS_REGION" \
  --instance-ids "$ORCHESTRYX_WIREGUARD_INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --parameters commands='["systemctl is-active amazon-ssm-agent && wg show wg0"]' \
  --query 'Command.CommandId' --output text)

aws ssm get-command-invocation --region "$AWS_REGION" \
  --command-id "$CMD_ID" \
  --instance-id "$ORCHESTRYX_WIREGUARD_INSTANCE_ID"

aws ecs list-tasks --cluster "$ORCHESTRYX_ECS_CLUSTER_NAME" --region "$AWS_REGION"

aws ecs describe-tasks --cluster "$ORCHESTRYX_ECS_CLUSTER_NAME" \
  --tasks "<task-arn>" --region "$AWS_REGION"

aws ec2 describe-security-groups --region "$AWS_REGION" \
  --filters Name=tag:OrchestryxManaged,Values=true Name=tag:ManagedBy,Values=orchestryx-worker
```

## Recovery

- Stop the lab through the API/UI first; destroy is idempotent for missing peers, stopped tasks, and absent SGs.
- If ECS still has a task, run `aws ecs stop-task`.
- If a per-lab SG remains after ENI detach, delete it by `GroupId`.
- If a WireGuard peer remains, remove it through SSM with `wg set wg0 peer <public-key> remove && wg-quick save wg0`.
- Stale provisioning labs are failed and refunded by the worker beat task.
