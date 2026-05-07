# Troubleshooting Slow Or Failed Provisioning

## Where To Look

1. User lab detail page: current status, progress, and recent `/labs/{id}/events`.
2. Admin console `/admin`: failed labs, queued labs, status messages, and event log.
3. Worker logs: `make logs-worker` or CloudWatch `/ecs/orchestryx-worker`.
4. CloudFormation stack: `orchestryx-lab-{instance_id}`.
5. EC2 system log and `/var/log/orchestryx-lab-init.log` on the lab host.
6. Secrets Manager secret: `orchestryx/lab/{instance_id}/vpn`.

## Common Failure Points

- CDK context missing or AWS credentials unavailable in the worker.
- ECR image was never pushed for an active custom lab.
- EC2 instance cannot pull from ECR because the instance role is missing or too restrictive.
- User data fails during `apt-get`, Docker startup, container health check, or WireGuard setup.
- The worker times out before CloudFormation or EC2 status checks finish.
- Secrets Manager write fails after infrastructure is created.

## Useful Commands

```bash
make logs-worker
aws cloudformation describe-stacks --stack-name orchestryx-lab-INSTANCE_ID --region eu-central-1
aws ec2 describe-instance-status --instance-ids EC2_ID --include-all-instances --region eu-central-1
aws secretsmanager describe-secret --secret-id orchestryx/lab/INSTANCE_ID/vpn --region eu-central-1
```

## Recovery

- User-owned labs can be stopped from My Labs or the lab detail page.
- Admins can stop labs from `/admin`.
- Expired labs are automatically queued for teardown.
- Stale provisioning labs are failed, refunded, and cleaned up by the worker beat task.
- If CloudFormation deletion fails, manually delete the `orchestryx-lab-{instance_id}` stack and then verify Secrets Manager cleanup.
