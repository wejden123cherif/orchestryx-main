#!/usr/bin/env bash
set -euo pipefail

# Idempotent one-time AWS setup for Orchestryx.
# This documents and automates the resources that were already created in the
# current eu-central-1 account. It is safe to run again: existing resources are
# detected and skipped where practical.

AWS_REGION="eu-central-1"
AWS_ACCOUNT_ID="254076817005"
ECS_CLUSTER="orchestryx"
VPC_ID="vpc-0d10f5a5902d4ffd4"
SUBNETS=("subnet-09b0a64b46e90bf03" "subnet-0f3460c06ddf5ecc9" "subnet-0ff556deb9702ca2a")

API_REPO="orchestryx-api"
WORKER_REPO="orchestryx-worker"
SECRET_NAME="orchestryx/api/env"
SECRET_ARN="arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:orchestryx/api/env-J7WB6D"
AURORA_ENDPOINT="orchestryx-db.cluster-cz86ciucmlhr.eu-central-1.rds.amazonaws.com"

EXECUTION_ROLE="orchestryx-ecs-execution-role"
API_TASK_ROLE="orchestryx-api-task-role"
WORKER_TASK_ROLE="orchestryx-worker-task-role"
TRUST_POLICY_FILE="scripts/aws/iam/ecs-task-trust-policy.json"
API_TASK_FILE="scripts/aws/task-definitions/api-task.json"
WORKER_TASK_FILE="scripts/aws/task-definitions/worker-task.json"

API_SG_NAME="orchestryx-api-sg"
WORKER_SG_NAME="orchestryx-worker-sg"
API_SG_ID="sg-0205b75f583ebfa25"
WORKER_SG_ID="sg-0db089ffb994e8272"
AURORA_SG_ID="sg-0088ffc271e2fa353"

API_LOG_GROUP="/ecs/orchestryx-api"
WORKER_LOG_GROUP="/ecs/orchestryx-worker"
API_SERVICE="orchestryx-api-service"
WORKER_SERVICE="orchestryx-worker-service"

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

  if aws ec2 describe-security-groups \
    --group-ids "${desired_id}" \
    --region "${AWS_REGION}" >/dev/null 2>&1; then
    echo "${desired_id}"
    return
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
  python - <<'PY' > "${tmp_secret}"
import json
import os

database_url = (
    "postgresql://"
    + os.environ["DB_USER"]
    + ":"
    + os.environ["DB_PASSWORD"]
    + "@orchestryx-db.cluster-cz86ciucmlhr.eu-central-1.rds.amazonaws.com:5432/orchestryx"
)

print(json.dumps({
    "DATABASE_URL": database_url,
    "SQL_ECHO": "false",
    "DB_SSL_MODE": "require",
    "AWS_REGION": "eu-central-1",
    "AWS_ACCOUNT_ID": "254076817005",
    "COGNITO_USER_POOL_ID": "eu-central-1_FCduBIpFa",
    "COGNITO_APP_CLIENT_ID": os.environ["COGNITO_CLIENT_ID"],
    "PROVISION_QUEUE": "orchestryx-provision-lab",
    "DESTROY_QUEUE": "orchestryx-destroy-lab",
    "SQS_PROVISION_URL": "https://sqs.eu-central-1.amazonaws.com/254076817005/orchestryx-provision-lab",
    "SQS_DESTROY_URL": "https://sqs.eu-central-1.amazonaws.com/254076817005/orchestryx-destroy-lab",
    "CORS_ALLOWED_ORIGINS": "http://localhost:3000",
    "CDK_INFRA_PATH": "infra",
    "WG_DNS": "1.1.1.1"
}))
PY

  aws secretsmanager create-secret \
    --name "${SECRET_NAME}" \
    --region "${AWS_REGION}" \
    --secret-string "file://${tmp_secret}" >/dev/null

  rm -f "${tmp_secret}"
  echo "Created secret ${SECRET_NAME}."
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

  if service_exists "${service_name}"; then
    echo "ECS service ${service_name} already exists; skipping create."
  else
    aws ecs create-service \
      --cluster "${ECS_CLUSTER}" \
      --service-name "${service_name}" \
      --task-definition "${task_definition}" \
      --desired-count 1 \
      --launch-type FARGATE \
      --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS[0]},${SUBNETS[1]}],securityGroups=[${security_group}],assignPublicIp=ENABLED}" \
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
ensure_policy_attached "${API_TASK_ROLE}" "arn:aws:iam::aws:policy/SecretsManagerReadWrite"

ensure_role "${WORKER_TASK_ROLE}"
ensure_policy_attached "${WORKER_TASK_ROLE}" "arn:aws:iam::aws:policy/AmazonSQSFullAccess"
ensure_policy_attached "${WORKER_TASK_ROLE}" "arn:aws:iam::aws:policy/AWSCloudFormationFullAccess"
ensure_policy_attached "${WORKER_TASK_ROLE}" "arn:aws:iam::aws:policy/AmazonEC2FullAccess"
ensure_policy_attached "${WORKER_TASK_ROLE}" "arn:aws:iam::aws:policy/SecretsManagerReadWrite"
ensure_policy_attached "${WORKER_TASK_ROLE}" "arn:aws:iam::aws:policy/CloudWatchFullAccess"

section "Security groups"
API_SG_ID="$(discover_or_create_sg "${API_SG_ID}" "${API_SG_NAME}" "Orchestryx API")"
WORKER_SG_ID="$(discover_or_create_sg "${WORKER_SG_ID}" "${WORKER_SG_NAME}" "Orchestryx worker")"
echo "Using API security group ${API_SG_ID}."
echo "Using worker security group ${WORKER_SG_ID}."
authorize_ingress_cidr "${API_SG_ID}" tcp 8000 "0.0.0.0/0"
authorize_ingress_source_sg "${AURORA_SG_ID}" "${API_SG_ID}" tcp 5432
authorize_ingress_source_sg "${AURORA_SG_ID}" "${WORKER_SG_ID}" tcp 5432

section "CloudWatch log groups"
ensure_log_group "${API_LOG_GROUP}"
ensure_log_group "${WORKER_LOG_GROUP}"

section "Secrets Manager"
ensure_secret

section "ECS task definitions"
ensure_task_definition "orchestryx-api" "${API_TASK_FILE}"
ensure_task_definition "orchestryx-worker" "${WORKER_TASK_FILE}"

section "ECS services"
ensure_service "${API_SERVICE}" "orchestryx-api" "${API_SG_ID}"
ensure_service "${WORKER_SERVICE}" "orchestryx-worker" "${WORKER_SG_ID}"

echo
echo "AWS setup complete."
echo "Documented secret ARN for existing environment: ${SECRET_ARN}"
