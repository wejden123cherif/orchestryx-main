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

## Database

| Resource | Value |
|---|---|
| Engine | Aurora PostgreSQL Serverless v2 |
| Cluster | `orchestryx-db` |
| Writer instance | `orchestryx-db-writer` |
| Database name | `orchestryx` |
| DB subnet group | `orchestryx-db-subnets` |
| Min ACU | `0.5` |
| Max ACU | `2` |
| Deletion protection | Enabled |
| Backup retention | `7` days |

The setup scripts create the DB subnet group, Aurora cluster, and serverless writer instance when they are missing. The database username, password, and database name are read from the `DATABASE_URL` key in Secrets Manager secret `orchestryx/api/env`; the scripts do not print or commit the credential values.

Already-created commands:

```bash
aws rds create-db-subnet-group --db-subnet-group-name orchestryx-db-subnets --db-subnet-group-description "Orchestryx Aurora subnet group" --subnet-ids subnet-09b0a64b46e90bf03 subnet-0f3460c06ddf5ecc9 subnet-0ff556deb9702ca2a --region eu-central-1
aws rds create-db-cluster --db-cluster-identifier orchestryx-db --engine aurora-postgresql --engine-mode provisioned --database-name orchestryx --master-username <secret-user> --master-user-password <secret-password> --db-subnet-group-name orchestryx-db-subnets --vpc-security-group-ids sg-0088ffc271e2fa353 --serverless-v2-scaling-configuration MinCapacity=0.5,MaxCapacity=2 --backup-retention-period 7 --deletion-protection --region eu-central-1
aws rds create-db-instance --db-instance-identifier orchestryx-db-writer --db-cluster-identifier orchestryx-db --engine aurora-postgresql --db-instance-class db.serverless --no-publicly-accessible --region eu-central-1
```

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
| API load balancer | `orchestryx-api-alb` |
| API target group | `orchestryx-api-tg` |
| Launch type | `FARGATE` |
| API desired count | `1` |
| Worker desired count | `1` |

The API service is exposed through an internet-facing Application Load Balancer. The ALB listens on HTTP `80`, forwards to the API target group on container port `8000`, and checks `/health`. The worker service has no public listener; it consumes SQS.

Already-created commands:

```bash
aws ecs create-cluster --cluster-name orchestryx --region eu-central-1

aws ecs register-task-definition --region eu-central-1 --cli-input-json file://scripts/aws/task-definitions/api-task.json
aws ecs register-task-definition --region eu-central-1 --cli-input-json file://scripts/aws/task-definitions/worker-task.json

aws elbv2 create-load-balancer --name orchestryx-api-alb --type application --scheme internet-facing --security-groups <alb-sg-id> --subnets subnet-09b0a64b46e90bf03 subnet-0f3460c06ddf5ecc9 --region eu-central-1
aws elbv2 create-target-group --name orchestryx-api-tg --protocol HTTP --port 8000 --vpc-id vpc-0d10f5a5902d4ffd4 --target-type ip --health-check-path /health --region eu-central-1
aws elbv2 create-listener --load-balancer-arn <alb-arn> --protocol HTTP --port 80 --default-actions Type=forward,TargetGroupArn=<target-group-arn> --region eu-central-1

aws ecs create-service --cluster orchestryx --service-name orchestryx-api-service --task-definition orchestryx-api --desired-count 1 --launch-type FARGATE --network-configuration "awsvpcConfiguration={subnets=[subnet-09b0a64b46e90bf03,subnet-0f3460c06ddf5ecc9],securityGroups=[sg-0205b75f583ebfa25],assignPublicIp=ENABLED}" --load-balancers "targetGroupArn=<target-group-arn>,containerName=orchestryx-api,containerPort=8000" --health-check-grace-period-seconds 60 --region eu-central-1
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
| Purpose | Runtime AWS permissions for SQS-backed background work. Lab runtime provisioning is disabled. |

Managed policies:

- `arn:aws:iam::aws:policy/AmazonSQSFullAccess`

Already-created commands:

```bash
aws iam create-role --role-name orchestryx-worker-task-role ...
aws iam attach-role-policy --role-name orchestryx-worker-task-role --policy-arn arn:aws:iam::aws:policy/AmazonSQSFullAccess
```

Future hardening: replace broad managed policies with least-privilege custom policies once ECS migration through platform CDK is stable.

## Security Groups

| Security group | ID | Purpose |
|---|---|---|
| ALB SG | created/discovered as `orchestryx-alb-sg` | Allows public HTTP traffic to the API ALB |
| API SG | `sg-0205b75f583ebfa25` | Allows ALB traffic to API container port `8000` |
| Worker SG | `sg-0db089ffb994e8272` | Worker task network identity |
| Aurora SG | `sg-0088ffc271e2fa353` | Aurora database access control |

Rules:

| Target SG | Source | Protocol | Port | Purpose |
|---|---|---|---:|---|
| `orchestryx-alb-sg` | `0.0.0.0/0` | TCP | `80` | Public API access |
| `sg-0205b75f583ebfa25` | `orchestryx-alb-sg` | TCP | `8000` | ALB to API tasks |
| `sg-0088ffc271e2fa353` | `sg-0205b75f583ebfa25` | TCP | `5432` | API to Aurora |
| `sg-0088ffc271e2fa353` | `sg-0db089ffb994e8272` | TCP | `5432` | Worker to Aurora |

Already-created commands:

```bash
aws ec2 create-security-group --group-name orchestryx-api-sg --description "Orchestryx API" --vpc-id vpc-0d10f5a5902d4ffd4
aws ec2 create-security-group --group-name orchestryx-worker-sg --description "Orchestryx worker" --vpc-id vpc-0d10f5a5902d4ffd4
aws ec2 create-security-group --group-name orchestryx-alb-sg --description "Orchestryx public API load balancer" --vpc-id vpc-0d10f5a5902d4ffd4
aws ec2 authorize-security-group-ingress --group-id <alb-sg-id> --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id sg-0205b75f583ebfa25 --protocol tcp --port 8000 --source-group <alb-sg-id>
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
- `LAB_RUNTIME_ENABLED`

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

The exact history is represented by `scripts/linux/setup-aws.sh` and `scripts/windows/setup-aws.ps1`. These scripts are legacy/manual bootstrap references and are not the recommended path for new infrastructure changes. Use `infra/platform_cdk/` as the active IaC entry point.

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
```

PowerShell equivalents:

```powershell
.\scripts\windows\deploy.ps1
.\scripts\windows\deploy.ps1 api
.\scripts\windows\deploy.ps1 worker
```

The setup scripts may still be read for migration history, but app deploys should consume CDK-generated values from `.env.deploy` or `.env.<env>.generated`.
