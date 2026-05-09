#!/usr/bin/env bash
set -euo pipefail

# Legacy/manual bootstrap helper. Prefer infra/platform_cdk/ for active
# infrastructure changes.
#
# Idempotent one-time AWS setup for Orchestryx.
# This documents and automates the resources that were already created in the
# current eu-central-1 account. It is safe to run again: existing resources are
# detected and skipped where practical.

AWS_REGION="${AWS_REGION:-eu-central-1}"

# Resolve account ID from the environment or STS so the script works across
# accounts without hardcoding.
if [[ -z "${AWS_ACCOUNT_ID:-}" ]]; then
  AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
fi

ECS_CLUSTER="orchestryx"
VPC_ID="${AWS_VPC_ID:-vpc-0d10f5a5902d4ffd4}"
SUBNETS=("${ORCHESTRYX_SUBNET_1:-subnet-09b0a64b46e90bf03}" "${ORCHESTRYX_SUBNET_2:-subnet-0f3460c06ddf5ecc9}" "${ORCHESTRYX_SUBNET_3:-subnet-0ff556deb9702ca2a}")

API_REPO="orchestryx-api"
WORKER_REPO="orchestryx-worker"
SECRET_NAME="orchestryx/api/env"
SECRET_ARN="${ORCHESTRYX_SECRET_ARN:-}"
AURORA_ENDPOINT="${ORCHESTRYX_AURORA_ENDPOINT:-orchestryx-db.cluster-placeholder.${AWS_REGION}.rds.amazonaws.com}"
AURORA_CLUSTER="${AWS_AURORA_CLUSTER:-orchestryx-db}"
AURORA_INSTANCE="${ORCHESTRYX_AURORA_INSTANCE:-orchestryx-db-writer}"
AURORA_DB_NAME="orchestryx"
AURORA_SUBNET_GROUP="orchestryx-db-subnets"
AURORA_MIN_CAPACITY="0.5"
AURORA_MAX_CAPACITY="2"

EXECUTION_ROLE="orchestryx-ecs-execution-role"
API_TASK_ROLE="orchestryx-api-task-role"
WORKER_TASK_ROLE="orchestryx-worker-task-role"
TRUST_POLICY_FILE="scripts/aws/iam/ecs-task-trust-policy.json"
API_TASK_FILE="scripts/aws/task-definitions/api-task.json"
WORKER_TASK_FILE="scripts/aws/task-definitions/worker-task.json"

API_SG_NAME="orchestryx-api-sg"
WORKER_SG_NAME="orchestryx-worker-sg"
ALB_SG_NAME="orchestryx-alb-sg"
API_SG_ID="${ORCHESTRYX_API_SG:-}"
WORKER_SG_ID="${ORCHESTRYX_WORKER_SG:-}"
ALB_SG_ID="${ORCHESTRYX_ALB_SG:-}"
AURORA_SG_ID="${ORCHESTRYX_AURORA_SG:-}"

API_LOG_GROUP="/ecs/orchestryx-api"
WORKER_LOG_GROUP="/ecs/orchestryx-worker"
API_SERVICE="orchestryx-api-service"
WORKER_SERVICE="orchestryx-worker-service"
ALB_NAME="orchestryx-api-alb"
TARGET_GROUP_NAME="orchestryx-api-tg"
API_CONTAINER_NAME="orchestryx-api"
API_CONTAINER_PORT="8000"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

section() {
  echo
  echo "==> $1"
}

ecr_repo_exists() {
  aws ecr describe-repositories \
    --repository-names "$1" \
    --region "${AWS_REGION}" >/dev/null 2>&1
}

ensure_ecr_repo() {
  local repo="$1"
  if ecr_repo_exists "${repo}"; then
    echo "ECR repository ${repo} already exists; skipping."
  else
    aws ecr create-repository --repository-name "${repo}" --region "${AWS_REGION}" >/dev/null
    echo "Created ECR repository ${repo}."
  fi
}

ensure_cluster() {
  local count
  count="$(aws ecs describe-clusters \
    --clusters "${ECS_CLUSTER}" \
    --region "${AWS_REGION}" \
    --query "clusters[?status!='INACTIVE'] | length(@)" \
    --output text)"
  if [[ "${count}" != "0" ]]; then
    echo "ECS cluster ${ECS_CLUSTER} already exists; skipping."
  else
    aws ecs create-cluster --cluster-name "${ECS_CLUSTER}" --region "${AWS_REGION}" >/dev/null
    echo "Created ECS cluster ${ECS_CLUSTER}."
  fi
}

ensure_role() {
  local role_name="$1"
  if aws iam get-role --role-name "${role_name}" >/dev/null 2>&1; then
    echo "IAM role ${role_name} already exists; skipping create."
  else
    aws iam create-role \
      --role-name "${role_name}" \
      --assume-role-policy-document "file://${TRUST_POLICY_FILE}" >/dev/null
    echo "Created IAM role ${role_name}."
  fi
}

ensure_policy_attached() {
  local role_name="$1"
  local policy_arn="$2"
  local attached
  attached="$(aws iam list-attached-role-policies \
    --role-name "${role_name}" \
    --query "AttachedPolicies[?PolicyArn=='${policy_arn}'] | length(@)" \
    --output text)"
  if [[ "${attached}" != "0" ]]; then
    echo "Policy already attached to ${role_name}: ${policy_arn}"
  else
    aws iam attach-role-policy --role-name "${role_name}" --policy-arn "${policy_arn}"
    echo "Attached policy to ${role_name}: ${policy_arn}"
  fi
}

discover_or_create_sg() {
  local desired_id="$1"
  local group_name="$2"
  local description="$3"
  local discovered_id

  if [[ -n "${desired_id}" ]]; then
    if aws ec2 describe-security-groups \
      --group-ids "${desired_id}" \
      --region "${AWS_REGION}" >/dev/null 2>&1; then
      echo "${desired_id}"
      return
    fi
  fi

  discovered_id="$(aws ec2 describe-security-groups \
    --region "${AWS_REGION}" \
    --filters "Name=group-name,Values=${group_name}" "Name=vpc-id,Values=${VPC_ID}" \
    --query "SecurityGroups[0].GroupId" \
    --output text)"

  if [[ "${discovered_id}" != "None" && -n "${discovered_id}" ]]; then
    echo "${discovered_id}"
    return
  fi

  aws ec2 create-security-group \
    --group-name "${group_name}" \
    --description "${description}" \
    --vpc-id "${VPC_ID}" \
    --region "${AWS_REGION}" \
    --query "GroupId" \
    --output text
}

authorize_ingress_cidr() {
  local sg_id="$1"
  local protocol="$2"
  local port="$3"
  local cidr="$4"
  local output

  set +e
  output="$(aws ec2 authorize-security-group-ingress \
    --group-id "${sg_id}" \
    --protocol "${protocol}" \
    --port "${port}" \
    --cidr "${cidr}" \
    --region "${AWS_REGION}" 2>&1)"
  local status=$?
  set -e

  if [[ ${status} -eq 0 ]]; then
    echo "Added ingress ${protocol}:${port} ${cidr} to ${sg_id}."
  elif [[ "${output}" == *"InvalidPermission.Duplicate"* ]]; then
    echo "Ingress ${protocol}:${port} ${cidr} already exists on ${sg_id}; skipping."
  else
    echo "${output}" >&2
    exit ${status}
  fi
}

ensure_target_group() {
  local target_group_arn

  set +e
  target_group_arn="$(aws elbv2 describe-target-groups \
    --names "${TARGET_GROUP_NAME}" \
    --region "${AWS_REGION}" \
    --query "TargetGroups[0].TargetGroupArn" \
    --output text 2>/dev/null)"
  local status=$?
  set -e

  if [[ ${status} -eq 0 && "${target_group_arn}" != "None" && -n "${target_group_arn}" ]]; then
    echo "${target_group_arn}"
    return
  fi

  aws elbv2 create-target-group \
    --name "${TARGET_GROUP_NAME}" \
    --protocol HTTP \
    --port "${API_CONTAINER_PORT}" \
    --vpc-id "${VPC_ID}" \
    --target-type ip \
    --health-check-protocol HTTP \
    --health-check-path /health \
    --health-check-interval-seconds 30 \
    --health-check-timeout-seconds 5 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 \
    --matcher HttpCode=200 \
    --region "${AWS_REGION}" \
    --query "TargetGroups[0].TargetGroupArn" \
    --output text
}

ensure_load_balancer() {
  local alb_arn

  set +e
  alb_arn="$(aws elbv2 describe-load-balancers \
    --names "${ALB_NAME}" \
    --region "${AWS_REGION}" \
    --query "LoadBalancers[0].LoadBalancerArn" \
    --output text 2>/dev/null)"
  local status=$?
  set -e

  if [[ ${status} -eq 0 && "${alb_arn}" != "None" && -n "${alb_arn}" ]]; then
    echo "${alb_arn}"
    return
  fi

  aws elbv2 create-load-balancer \
    --name "${ALB_NAME}" \
    --type application \
    --scheme internet-facing \
    --ip-address-type ipv4 \
    --security-groups "${ALB_SG_ID}" \
    --subnets "${SUBNETS[0]}" "${SUBNETS[1]}" \
    --region "${AWS_REGION}" \
    --query "LoadBalancers[0].LoadBalancerArn" \
    --output text
}

ensure_http_listener() {
  local alb_arn="$1"
  local target_group_arn="$2"
  local listener_arn

  listener_arn="$(aws elbv2 describe-listeners \
    --load-balancer-arn "${alb_arn}" \
    --region "${AWS_REGION}" \
    --query "Listeners[?Port==\`80\`].ListenerArn | [0]" \
    --output text)"

  if [[ "${listener_arn}" != "None" && -n "${listener_arn}" ]]; then
    echo "ALB HTTP listener already exists."
    return
  fi

  aws elbv2 create-listener \
    --load-balancer-arn "${alb_arn}" \
    --protocol HTTP \
    --port 80 \
    --default-actions "Type=forward,TargetGroupArn=${target_group_arn}" \
    --region "${AWS_REGION}" >/dev/null
  echo "Created ALB HTTP listener on port 80."
}

get_alb_dns_name() {
  aws elbv2 describe-load-balancers \
    --names "${ALB_NAME}" \
    --region "${AWS_REGION}" \
    --query "LoadBalancers[0].DNSName" \
    --output text
}

authorize_ingress_source_sg() {
  local target_sg="$1"
  local source_sg="$2"
  local protocol="$3"
  local port="$4"
  local output

  set +e
  output="$(aws ec2 authorize-security-group-ingress \
    --group-id "${target_sg}" \
    --protocol "${protocol}" \
    --port "${port}" \
    --source-group "${source_sg}" \
    --region "${AWS_REGION}" 2>&1)"
  local status=$?
  set -e

  if [[ ${status} -eq 0 ]]; then
    echo "Allowed ${source_sg} to reach ${target_sg} on ${protocol}:${port}."
  elif [[ "${output}" == *"InvalidPermission.Duplicate"* ]]; then
    echo "Ingress from ${source_sg} to ${target_sg} already exists; skipping."
  else
    echo "${output}" >&2
    exit ${status}
  fi
}

ensure_log_group() {
  local log_group="$1"
  local output

  set +e
  output="$(aws logs create-log-group \
    --log-group-name "${log_group}" \
    --region "${AWS_REGION}" 2>&1)"
  local status=$?
  set -e

  if [[ ${status} -eq 0 ]]; then
    echo "Created log group ${log_group}."
  elif [[ "${output}" == *"ResourceAlreadyExistsException"* ]]; then
    echo "Log group ${log_group} already exists; skipping."
  else
    echo "${output}" >&2
    exit ${status}
  fi
}

ensure_secret() {
  if aws secretsmanager describe-secret --secret-id "${SECRET_NAME}" --region "${AWS_REGION}" >/dev/null 2>&1; then
    echo "Secret ${SECRET_NAME} already exists; skipping create."
    return
  fi

  echo "Creating ${SECRET_NAME}. Values are not printed."
  read -r -p "Aurora database username [orchestryx]: " db_user
  db_user="${db_user:-orchestryx}"
  read -r -s -p "Aurora database password: " db_password
  echo
  read -r -p "Cognito app client ID: " cognito_client_id

  if [[ -z "${db_password}" || -z "${cognito_client_id}" ]]; then
    echo "Aurora password and Cognito app client ID are required to create the secret." >&2
    exit 1
  fi

  local tmp_secret
  tmp_secret="$(mktemp)"
  DB_USER="${db_user}" \
  DB_PASSWORD="${db_password}" \
  COGNITO_CLIENT_ID="${cognito_client_id}" \
  AWS_ACCOUNT_ID_VAL="${AWS_ACCOUNT_ID}" \
  AWS_REGION_VAL="${AWS_REGION}" \
  COGNITO_POOL_VAL="${COGNITO_POOL:-}" \
  python - <<'PY' > "${tmp_secret}"
import json
import os

database_url = (
    "postgresql://"
    + os.environ["DB_USER"]
    + ":"
    + os.environ["DB_PASSWORD"]
    + "@orchestryx-db.cluster-placeholder."
    + os.environ["AWS_REGION_VAL"]
    + ".rds.amazonaws.com:5432/orchestryx"
)

print(json.dumps({
    "DATABASE_URL": database_url,
    "SQL_ECHO": "false",
    "DB_SSL_MODE": "require",
    "AWS_REGION": os.environ["AWS_REGION_VAL"],
    "AWS_ACCOUNT_ID": os.environ["AWS_ACCOUNT_ID_VAL"],
    "COGNITO_USER_POOL_ID": os.environ.get("COGNITO_POOL_VAL", ""),
    "COGNITO_APP_CLIENT_ID": os.environ["COGNITO_CLIENT_ID"],
    "PROVISION_QUEUE": "orchestryx-provision-lab",
    "DESTROY_QUEUE": "orchestryx-destroy-lab",
    "SQS_PROVISION_URL": "https://sqs." + os.environ["AWS_REGION_VAL"] + ".amazonaws.com/" + os.environ["AWS_ACCOUNT_ID_VAL"] + "/orchestryx-provision-lab",
    "SQS_DESTROY_URL": "https://sqs." + os.environ["AWS_REGION_VAL"] + ".amazonaws.com/" + os.environ["AWS_ACCOUNT_ID_VAL"] + "/orchestryx-destroy-lab",
    "CORS_ALLOWED_ORIGINS": "http://localhost:3000",
    "LAB_RUNTIME_ENABLED": "false"
}))
PY

  aws secretsmanager create-secret \
    --name "${SECRET_NAME}" \
    --region "${AWS_REGION}" \
    --secret-string "file://${tmp_secret}" >/dev/null

  rm -f "${tmp_secret}"
  echo "Created secret ${SECRET_NAME}."
}

read_database_credentials() {
  aws secretsmanager get-secret-value \
    --secret-id "${SECRET_NAME}" \
    --region "${AWS_REGION}" \
    --query SecretString \
    --output text |
    python -c 'import json, sys, urllib.parse
secret = json.load(sys.stdin)
url = urllib.parse.urlparse(secret["DATABASE_URL"])
print(urllib.parse.unquote(url.username or ""))
print(urllib.parse.unquote(url.password or ""))
print((url.path or "/orchestryx").lstrip("/") or "orchestryx")'
}

ensure_db_subnet_group() {
  if aws rds describe-db-subnet-groups \
    --db-subnet-group-name "${AURORA_SUBNET_GROUP}" \
    --region "${AWS_REGION}" >/dev/null 2>&1; then
    echo "DB subnet group ${AURORA_SUBNET_GROUP} already exists; skipping."
    return
  fi

  aws rds create-db-subnet-group \
    --db-subnet-group-name "${AURORA_SUBNET_GROUP}" \
    --db-subnet-group-description "Orchestryx Aurora subnet group" \
    --subnet-ids "${SUBNETS[@]}" \
    --region "${AWS_REGION}" >/dev/null
  echo "Created DB subnet group ${AURORA_SUBNET_GROUP}."
}

cluster_exists() {
  aws rds describe-db-clusters \
    --db-cluster-identifier "${AURORA_CLUSTER}" \
    --region "${AWS_REGION}" >/dev/null 2>&1
}

db_instance_exists() {
  aws rds describe-db-instances \
    --db-instance-identifier "${AURORA_INSTANCE}" \
    --region "${AWS_REGION}" >/dev/null 2>&1
}

ensure_aurora_database() {
  local db_config
  local db_user
  local db_password
  local db_name
  db_config="$(read_database_credentials)"
  db_user="$(printf '%s\n' "${db_config}" | sed -n '1p')"
  db_password="$(printf '%s\n' "${db_config}" | sed -n '2p')"
  db_name="$(printf '%s\n' "${db_config}" | sed -n '3p')"
  db_name="${db_name:-${AURORA_DB_NAME}}"

  if [[ -z "${db_user}" || -z "${db_password}" ]]; then
    echo "DATABASE_URL in ${SECRET_NAME} must include a database username and password." >&2
    exit 1
  fi

  ensure_db_subnet_group

  if cluster_exists; then
    echo "Aurora cluster ${AURORA_CLUSTER} already exists; skipping create."
  else
    aws rds create-db-cluster \
      --db-cluster-identifier "${AURORA_CLUSTER}" \
      --engine aurora-postgresql \
      --engine-mode provisioned \
      --database-name "${db_name}" \
      --master-username "${db_user}" \
      --master-user-password "${db_password}" \
      --db-subnet-group-name "${AURORA_SUBNET_GROUP}" \
      --vpc-security-group-ids "${AURORA_SG_ID}" \
      --serverless-v2-scaling-configuration "MinCapacity=${AURORA_MIN_CAPACITY},MaxCapacity=${AURORA_MAX_CAPACITY}" \
      --backup-retention-period 7 \
      --deletion-protection \
      --region "${AWS_REGION}" >/dev/null
    echo "Created Aurora cluster ${AURORA_CLUSTER}."
  fi

  if db_instance_exists; then
    echo "Aurora writer instance ${AURORA_INSTANCE} already exists; skipping create."
  else
    aws rds create-db-instance \
      --db-instance-identifier "${AURORA_INSTANCE}" \
      --db-cluster-identifier "${AURORA_CLUSTER}" \
      --engine aurora-postgresql \
      --db-instance-class db.serverless \
      --no-publicly-accessible \
      --region "${AWS_REGION}" >/dev/null
    echo "Created Aurora writer instance ${AURORA_INSTANCE}."
  fi

  echo "Waiting for Aurora writer instance to become available..."
  aws rds wait db-instance-available \
    --db-instance-identifier "${AURORA_INSTANCE}" \
    --region "${AWS_REGION}"
  echo "Aurora is available at ${AURORA_ENDPOINT}."
}

task_definition_exists() {
  aws ecs describe-task-definition \
    --task-definition "$1" \
    --region "${AWS_REGION}" >/dev/null 2>&1
}

ensure_task_definition() {
  local family="$1"
  local file="$2"
  if task_definition_exists "${family}"; then
    echo "Task definition ${family} already exists; skipping registration."
  else
    aws ecs register-task-definition \
      --region "${AWS_REGION}" \
      --cli-input-json "file://${file}" >/dev/null
    echo "Registered task definition ${family}."
  fi
}

service_exists() {
  local service_name="$1"
  local count
  count="$(aws ecs describe-services \
    --cluster "${ECS_CLUSTER}" \
    --services "${service_name}" \
    --region "${AWS_REGION}" \
    --query "services[?status!='INACTIVE'] | length(@)" \
    --output text)"
  [[ "${count}" != "0" ]]
}

ensure_service() {
  local service_name="$1"
  local task_definition="$2"
  local security_group="$3"
  local target_group_arn="${4:-}"
  local load_balancer_args=()

  if [[ -n "${target_group_arn}" ]]; then
    load_balancer_args=(
      --load-balancers "targetGroupArn=${target_group_arn},containerName=${API_CONTAINER_NAME},containerPort=${API_CONTAINER_PORT}"
      --health-check-grace-period-seconds 60
    )
  fi

  if service_exists "${service_name}"; then
    if [[ -z "${target_group_arn}" ]]; then
      echo "ECS service ${service_name} already exists; skipping create."
      return
    fi

    echo "ECS service ${service_name} already exists; ensuring latest load balancer settings."
    aws ecs update-service \
      --cluster "${ECS_CLUSTER}" \
      --service "${service_name}" \
      "${load_balancer_args[@]}" \
      --region "${AWS_REGION}" >/dev/null
  else
    aws ecs create-service \
      --cluster "${ECS_CLUSTER}" \
      --service-name "${service_name}" \
      --task-definition "${task_definition}" \
      --desired-count 1 \
      --launch-type FARGATE \
      --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS[0]},${SUBNETS[1]}],securityGroups=[${security_group}],assignPublicIp=ENABLED}" \
      "${load_balancer_args[@]}" \
      --region "${AWS_REGION}" >/dev/null
    echo "Created ECS service ${service_name}."
  fi
}

require_command aws
require_command python

section "ECR repositories"
ensure_ecr_repo "${API_REPO}"
ensure_ecr_repo "${WORKER_REPO}"

section "ECS cluster"
ensure_cluster

section "IAM roles"
ensure_role "${EXECUTION_ROLE}"
ensure_policy_attached "${EXECUTION_ROLE}" "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
ensure_policy_attached "${EXECUTION_ROLE}" "arn:aws:iam::aws:policy/SecretsManagerReadWrite"

ensure_role "${API_TASK_ROLE}"
ensure_policy_attached "${API_TASK_ROLE}" "arn:aws:iam::aws:policy/AmazonCognitoPowerUser"
ensure_policy_attached "${API_TASK_ROLE}" "arn:aws:iam::aws:policy/AmazonSQSFullAccess"
ensure_policy_attached "${API_TASK_ROLE}" "arn:aws:iam::aws:policy/SecretsManagerReadWrite"

ensure_role "${WORKER_TASK_ROLE}"
ensure_policy_attached "${WORKER_TASK_ROLE}" "arn:aws:iam::aws:policy/AmazonSQSFullAccess"

section "Security groups"
API_SG_ID="$(discover_or_create_sg "${API_SG_ID}" "${API_SG_NAME}" "Orchestryx API")"
WORKER_SG_ID="$(discover_or_create_sg "${WORKER_SG_ID}" "${WORKER_SG_NAME}" "Orchestryx worker")"
ALB_SG_ID="$(discover_or_create_sg "${ALB_SG_ID}" "${ALB_SG_NAME}" "Orchestryx public API load balancer")"
echo "Using API security group ${API_SG_ID}."
echo "Using worker security group ${WORKER_SG_ID}."
echo "Using ALB security group ${ALB_SG_ID}."
authorize_ingress_cidr "${ALB_SG_ID}" tcp 80 "0.0.0.0/0"
authorize_ingress_source_sg "${API_SG_ID}" "${ALB_SG_ID}" tcp 8000
authorize_ingress_source_sg "${AURORA_SG_ID}" "${API_SG_ID}" tcp 5432
authorize_ingress_source_sg "${AURORA_SG_ID}" "${WORKER_SG_ID}" tcp 5432

section "Application Load Balancer"
TARGET_GROUP_ARN="$(ensure_target_group)"
ALB_ARN="$(ensure_load_balancer)"
ensure_http_listener "${ALB_ARN}" "${TARGET_GROUP_ARN}"
ALB_DNS_NAME="$(get_alb_dns_name)"
echo "ALB URL: http://${ALB_DNS_NAME}"

section "CloudWatch log groups"
ensure_log_group "${API_LOG_GROUP}"
ensure_log_group "${WORKER_LOG_GROUP}"

section "Secrets Manager"
ensure_secret

section "Aurora PostgreSQL"
ensure_aurora_database

section "ECS task definitions"
ensure_task_definition "orchestryx-api" "${API_TASK_FILE}"
ensure_task_definition "orchestryx-worker" "${WORKER_TASK_FILE}"

section "ECS services"
ensure_service "${API_SERVICE}" "orchestryx-api" "${API_SG_ID}" "${TARGET_GROUP_ARN}"
ensure_service "${WORKER_SERVICE}" "orchestryx-worker" "${WORKER_SG_ID}"

echo
echo "AWS setup complete."
echo "Public API URL: http://${ALB_DNS_NAME}"
echo "Documented secret ARN for existing environment: ${SECRET_ARN}"
