#!/usr/bin/env bash
set -euo pipefail

# Build and deploy Orchestryx ECS images.
# Usage:
#   ./scripts/linux/deploy.sh          # deploy API and worker
#   ./scripts/linux/deploy.sh api      # deploy only API
#   ./scripts/linux/deploy.sh worker   # deploy only worker

AWS_REGION="eu-central-1"
AWS_ACCOUNT_ID="254076817005"
ECS_CLUSTER="orchestryx"
ECR_API="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/orchestryx-api"
ECR_WORKER="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/orchestryx-worker"
API_SERVICE="orchestryx-api-service"
WORKER_SERVICE="orchestryx-worker-service"
API_TASK_ROLE="orchestryx-api-task-role"
API_SQS_POLICY_ARN="arn:aws:iam::aws:policy/AmazonSQSFullAccess"

TARGET="${1:-all}"

if [[ "${TARGET}" != "all" && "${TARGET}" != "api" && "${TARGET}" != "worker" ]]; then
  echo "Usage: $0 [api|worker]" >&2
  exit 2
fi

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

login_ecr() {
  echo "Logging in to ECR in ${AWS_REGION}..."
  aws ecr get-login-password --region "${AWS_REGION}" \
    | docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
}

ensure_api_sqs_policy() {
  local attached

  attached="$(aws iam list-attached-role-policies \
    --role-name "${API_TASK_ROLE}" \
    --query "length(AttachedPolicies[?PolicyArn=='${API_SQS_POLICY_ARN}'])" \
    --output text)"

  if [[ "${attached}" != "0" ]]; then
    echo "API task role already has SQS policy attached."
    return
  fi

  echo "Attaching SQS policy to ${API_TASK_ROLE}..."
  aws iam attach-role-policy \
    --role-name "${API_TASK_ROLE}" \
    --policy-arn "${API_SQS_POLICY_ARN}"
}

deploy_api() {
  ensure_api_sqs_policy

  echo "Building API image..."
  docker build -f Dockerfile -t orchestryx-api:latest .

  echo "Tagging API image as ${ECR_API}:latest..."
  docker tag orchestryx-api:latest "${ECR_API}:latest"

  echo "Pushing API image..."
  docker push "${ECR_API}:latest"

  echo "Forcing ECS redeployment for ${API_SERVICE}..."
  aws ecs update-service \
    --cluster "${ECS_CLUSTER}" \
    --service "${API_SERVICE}" \
    --force-new-deployment \
    --region "${AWS_REGION}" >/dev/null
}

deploy_worker() {
  echo "Building worker image..."
  docker build -f Dockerfile.worker -t orchestryx-worker:latest .

  echo "Tagging worker image as ${ECR_WORKER}:latest..."
  docker tag orchestryx-worker:latest "${ECR_WORKER}:latest"

  echo "Pushing worker image..."
  docker push "${ECR_WORKER}:latest"

  echo "Forcing ECS redeployment for ${WORKER_SERVICE}..."
  aws ecs update-service \
    --cluster "${ECS_CLUSTER}" \
    --service "${WORKER_SERVICE}" \
    --force-new-deployment \
    --region "${AWS_REGION}" >/dev/null
}

require_command aws
require_command docker

login_ecr

case "${TARGET}" in
  api)
    deploy_api
    ;;
  worker)
    deploy_worker
    ;;
  all)
    deploy_api
    deploy_worker
    ;;
esac

echo "Deployment complete."
