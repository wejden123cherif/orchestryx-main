# Orchestryx AWS Setup

This document is the team reference for the AWS infrastructure used to run Orchestryx on ECS/Fargate. The resources below already exist in the current AWS account. The setup scripts in `scripts/` are idempotent and document how the environment can be recreated in another account.

## Environment

| Item | Value |
|---|---|
| Region | `eu-central-1` |
| Account | `254076817005` |
| Default VPC | `vpc-0d10f5a5902d4ffd4` |
| Subnets | `subnet-09b0a64b46e90bf03`, `subnet-0f3460c06ddf5ecc9`, `subnet-0ff556deb9702ca2a` |
| Aurora endpoint | `orchestryx-db.cluster-cz86ciucmlhr.eu-central-1.rds.amazonaws.com` |

## Container Registry

| Repository | URI |
|---|---|
| API | `254076817005.dkr.ecr.eu-central-1.amazonaws.com/orchestryx-api` |
| Worker | `254076817005.dkr.ecr.eu-central-1.amazonaws.com/orchestryx-worker` |

Already-created commands:

```bash
aws ecr create-repository --repository-name orchestryx-api --region eu-central-1
aws ecr create-repository --repository-name orchestryx-worker --region eu-central-1
```

## ECS

| Resource | Value |
|---|---|
| Cluster | `orchestryx` |
| API task definition | `orchestryx-api:1` |
| Worker task definition | `orchestryx-worker:1` |
| API service | `orchestryx-api-service` |
| Worker service | `orchestryx-worker-service` |
| Launch type | `FARGATE` |
| API desired count | `1` |
| Worker desired count | `1` |

The API service is public for now because its awsvpc network config assigns a public IP and allows inbound TCP `8000` through `sg-0205b75f583ebfa25`. The worker service has no public listener; it consumes SQS.

Already-created commands:

```bash
aws ecs create-cluster --cluster-name orchestryx --region eu-central-1

aws ecs register-task-definition --region eu-central-1 --cli-input-json file://scripts/aws/task-definitions/api-task.json
aws ecs register-task-definition --region eu-central-1 --cli-input-json file://scripts/aws/task-definitions/worker-task.json

aws ecs create-service --cluster orchestryx --service-name orchestryx-api-service --task-definition orchestryx-api --desired-count 1 --launch-type FARGATE --network-configuration "awsvpcConfiguration={subnets=[subnet-09b0a64b46e90bf03,subnet-0f3460c06ddf5ecc9],securityGroups=[sg-0205b75f583ebfa25],assignPublicIp=ENABLED}" --region eu-central-1
aws ecs create-service --cluster orchestryx --service-name orchestryx-worker-service --task-definition orchestryx-worker --desired-count 1 --launch-type FARGATE --network-configuration "awsvpcConfiguration={subnets=[subnet-09b0a64b46e90bf03,subnet-0f3460c06ddf5ecc9],securityGroups=[sg-0db089ffb994e8272],assignPublicIp=ENABLED}" --region eu-central-1
```

## IAM

### Execution Role

| Item | Value |
|---|---|
| Role | `orchestryx-ecs-execution-role` |
| Purpose | ECS agent permissions for image pull, logs, and secret injection |

Managed policies:

- `arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy`
- `arn:aws:iam::aws:policy/SecretsManagerReadWrite`

Already-created commands:

```bash
aws iam create-role --role-name orchestryx-ecs-execution-role ...
aws iam attach-role-policy --role-name orchestryx-ecs-execution-role --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
aws iam attach-role-policy --role-name orchestryx-ecs-execution-role --policy-arn arn:aws:iam::aws:policy/SecretsManagerReadWrite
```

### API Task Role

| Item | Value |
|---|---|
| Role | `orchestryx-api-task-role` |
| Purpose | Runtime AWS permissions for FastAPI |

Managed policies:

- `arn:aws:iam::aws:policy/AmazonCognitoPowerUser`
- `arn:aws:iam::aws:policy/SecretsManagerReadWrite`

Already-created commands:

```bash
aws iam create-role --role-name orchestryx-api-task-role ...
aws iam attach-role-policy --role-name orchestryx-api-task-role --policy-arn arn:aws:iam::aws:policy/AmazonCognitoPowerUser
aws iam attach-role-policy --role-name orchestryx-api-task-role --policy-arn arn:aws:iam::aws:policy/SecretsManagerReadWrite
```

### Worker Task Role

| Item | Value |
|---|---|
| Role | `orchestryx-worker-task-role` |
| Purpose | Runtime AWS permissions for SQS consumption, CDK/CloudFormation provisioning, lab network resources, logs, and secrets |

Managed policies:

- `arn:aws:iam::aws:policy/AmazonSQSFullAccess`
- `arn:aws:iam::aws:policy/AWSCloudFormationFullAccess`
- `arn:aws:iam::aws:policy/AmazonEC2FullAccess`
- `arn:aws:iam::aws:policy/SecretsManagerReadWrite`
- `arn:aws:iam::aws:policy/CloudWatchFullAccess`

Already-created commands:

```bash
aws iam create-role --role-name orchestryx-worker-task-role ...
aws iam attach-role-policy --role-name orchestryx-worker-task-role --policy-arn arn:aws:iam::aws:policy/AmazonSQSFullAccess
aws iam attach-role-policy --role-name orchestryx-worker-task-role --policy-arn arn:aws:iam::aws:policy/AWSCloudFormationFullAccess
aws iam attach-role-policy --role-name orchestryx-worker-task-role --policy-arn arn:aws:iam::aws:policy/AmazonEC2FullAccess
aws iam attach-role-policy --role-name orchestryx-worker-task-role --policy-arn arn:aws:iam::aws:policy/SecretsManagerReadWrite
aws iam attach-role-policy --role-name orchestryx-worker-task-role --policy-arn arn:aws:iam::aws:policy/CloudWatchFullAccess
```

Future hardening: replace broad managed policies with least-privilege custom policies once the provisioning stack is stable.

## Security Groups

| Security group | ID | Purpose |
|---|---|---|
| API SG | `sg-0205b75f583ebfa25` | Allows public API traffic to container port `8000` |
| Worker SG | `sg-0db089ffb994e8272` | Worker task network identity |
| Aurora SG | `sg-0088ffc271e2fa353` | Aurora database access control |

Rules:

| Target SG | Source | Protocol | Port | Purpose |
|---|---|---|---:|---|
| `sg-0205b75f583ebfa25` | `0.0.0.0/0` | TCP | `8000` | Public API access |
| `sg-0088ffc271e2fa353` | `sg-0205b75f583ebfa25` | TCP | `5432` | API to Aurora |
| `sg-0088ffc271e2fa353` | `sg-0db089ffb994e8272` | TCP | `5432` | Worker to Aurora |

Already-created commands:

```bash
aws ec2 create-security-group --group-name orchestryx-api-sg --description "Orchestryx API" --vpc-id vpc-0d10f5a5902d4ffd4
aws ec2 create-security-group --group-name orchestryx-worker-sg --description "Orchestryx worker" --vpc-id vpc-0d10f5a5902d4ffd4
aws ec2 authorize-security-group-ingress --group-id sg-0205b75f583ebfa25 --protocol tcp --port 8000 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id sg-0088ffc271e2fa353 --protocol tcp --port 5432 --source-group sg-0205b75f583ebfa25
aws ec2 authorize-security-group-ingress --group-id sg-0088ffc271e2fa353 --protocol tcp --port 5432 --source-group sg-0db089ffb994e8272
```

## SQS

| Queue | URL |
|---|---|
| Provision | `https://sqs.eu-central-1.amazonaws.com/254076817005/orchestryx-provision-lab` |
| Destroy | `https://sqs.eu-central-1.amazonaws.com/254076817005/orchestryx-destroy-lab` |

The queues were already present before the ECS setup. Celery uses these as predefined SQS queues.

## Secrets Manager

| Item | Value |
|---|---|
| Secret name | `orchestryx/api/env` |
| Secret ARN | `arn:aws:secretsmanager:eu-central-1:254076817005:secret:orchestryx/api/env-J7WB6D` |
| Purpose | ECS runtime environment variables for API and worker |

The task definitions reference JSON keys inside this secret using ECS secret injection. Expected keys:

- `DATABASE_URL`
- `SQL_ECHO`
- `DB_SSL_MODE`
- `AWS_REGION`
- `AWS_ACCOUNT_ID`
- `COGNITO_USER_POOL_ID`
- `COGNITO_APP_CLIENT_ID`
- `PROVISION_QUEUE`
- `DESTROY_QUEUE`
- `SQS_PROVISION_URL`
- `SQS_DESTROY_URL`
- `CORS_ALLOWED_ORIGINS`
- `CDK_INFRA_PATH`
- `WG_DNS`

Already-created command:

```bash
aws secretsmanager create-secret --name orchestryx/api/env --region eu-central-1 --secret-string '{...}'
```

Do not commit the actual secret string.

## CloudWatch Logs

| Log group | Purpose |
|---|---|
| `/ecs/orchestryx-api` | FastAPI ECS task logs |
| `/ecs/orchestryx-worker` | Celery worker ECS task logs |

Already-created commands:

```bash
aws logs create-log-group --log-group-name /ecs/orchestryx-api --region eu-central-1
aws logs create-log-group --log-group-name /ecs/orchestryx-worker --region eu-central-1
```

## Task Definition Files

Version-controlled ECS task definition inputs:

- `scripts/aws/task-definitions/api-task.json`
- `scripts/aws/task-definitions/worker-task.json`

Both use:

- Fargate
- `awsvpc` networking
- `512` CPU
- `1024` MB memory
- ECR `latest` image tags
- Secrets Manager runtime configuration
- CloudWatch awslogs driver

## Version-Controlled AWS Inputs

Operational AWS inputs are grouped under `scripts/aws/`:

- `scripts/aws/task-definitions/`: ECS task definitions registered by the setup scripts.
- `scripts/aws/iam/ecs-task-trust-policy.json`: ECS task trust policy used by all task roles.
- `scripts/aws/iam/roles.json`: IAM roles, ARNs, purposes, and managed policy attachments.
- `scripts/aws/security-groups/security-groups.json`: security group inventory and ingress rules.
- `scripts/aws/ecs/services.json`: ECS service, subnet, and security group placement.
- `scripts/aws/ecr/repositories.json`: ECR repository names and image source mapping.
- `scripts/aws/logs/log-groups.json`: CloudWatch log group inventory.
- `scripts/aws/secrets/secrets.json`: Secrets Manager metadata without secret values.

These files are documentation and CLI inputs only. They must not contain passwords, access keys, or copied secret values.

## What Was Already Created And When

These resources were already created before this documentation pass on April 27, 2026:

- ECR repositories: `orchestryx-api`, `orchestryx-worker`
- ECS cluster: `orchestryx`
- IAM roles: `orchestryx-ecs-execution-role`, `orchestryx-api-task-role`, `orchestryx-worker-task-role`
- Security groups: API, worker, and Aurora ingress rules listed above
- CloudWatch log groups: `/ecs/orchestryx-api`, `/ecs/orchestryx-worker`
- Secrets Manager secret: `orchestryx/api/env`
- ECS task definitions: `orchestryx-api:1`, `orchestryx-worker:1`
- ECS services: `orchestryx-api-service`, `orchestryx-worker-service`

The exact history is represented by `scripts/linux/setup-aws.sh` and `scripts/windows/setup-aws.ps1`. These scripts are designed to skip resources that already exist.

## Operations

Use the Makefile from the repo root:

```bash
make deploy
make deploy-api
make deploy-worker
make status
make logs-api
make logs-worker
make restart-api
make restart-worker
make setup-aws
```

PowerShell equivalents:

```powershell
.\scripts\windows\deploy.ps1
.\scripts\windows\deploy.ps1 api
.\scripts\windows\deploy.ps1 worker
.\scripts\windows\setup-aws.ps1
```
