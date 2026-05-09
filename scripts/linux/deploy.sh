#!/usr/bin/env bash
set -euo pipefail

# Build and deploy Orchestryx API/worker images to existing ECS services.
#
# Infrastructure must already exist through infra/platform_cdk/.
#
# Usage:
#   scripts/linux/deploy.sh             # deploy API and worker
#   scripts/linux/deploy.sh api         # deploy only API
#   scripts/linux/deploy.sh worker      # deploy only worker
#   scripts/linux/deploy.sh images      # build and push images without ECS update
#
# Optional:
#   ENV_FILE=.env.staging.generated scripts/linux/deploy.sh
#   WAIT_FOR_STABILITY=true scripts/linux/deploy.sh api
#   IMAGE_TAG=2026-05-09.1 scripts/linux/deploy.sh
#   FORCE=true ORCHESTRYX_ENV=prod scripts/linux/deploy.sh

TARGET="${1:-all}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
WAIT_FOR_STABILITY="${WAIT_FOR_STABILITY:-false}"
FORCE="${FORCE:-false}"
DEPLOY_ENV_NAME="${ORCHESTRYX_ENV:-${DEPLOY_ENV:-${ENV:-dev}}}"
ENV_FILE="${ENV_FILE:-}"

if [[ "${TARGET}" != "all" && "${TARGET}" != "api" && "${TARGET}" != "worker" && "${TARGET}" != "images" ]]; then
  echo "Usage: $0 [api|worker|images]" >&2
  exit 2
fi

repo_root() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cd "${script_dir}/../.." && pwd
}

ROOT_DIR="$(repo_root)"
cd "${ROOT_DIR}"

load_env_file() {
  local file="$1"
  if [[ ! -f "${file}" ]]; then
    return
  fi

  echo "Loading deploy environment from ${file}"
  while IFS= read -r line || [[ -n "${line}" ]]; do
    [[ -z "${line}" || "${line}" =~ ^[[:space:]]*# ]] && continue
    [[ "${line}" != *=* ]] && continue

    local key="${line%%=*}"
    local value="${line#*=}"
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"

    if [[ "${key}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ && -z "${!key:-}" ]]; then
      value="${value%$'\r'}"
      value="${value%\"}"
      value="${value#\"}"
      value="${value%\'}"
      value="${value#\'}"
      export "${key}=${value}"
    fi
  done < "${file}"
}

if [[ -n "${ENV_FILE}" ]]; then
  load_env_file "${ENV_FILE}"
else
  load_env_file ".env.deploy"
  load_env_file ".env.${DEPLOY_ENV_NAME}.generated"
fi

ORCHESTRYX_ENV="${ORCHESTRYX_ENV:-${DEPLOY_ENV_NAME}}"
export ORCHESTRYX_ENV

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required deploy variable: ${name}" >&2
    echo "Generate it from CDK outputs with: cd infra/platform_cdk && python export_env.py --env ${ORCHESTRYX_ENV} --outputs-file cdk-outputs-${ORCHESTRYX_ENV}.json" >&2
    exit 1
  fi
}

confirm_prod() {
  if [[ "${ORCHESTRYX_ENV}" != "prod" ]]; then
    return
  fi

  if [[ "${FORCE}" == "true" ]]; then
    return
  fi

  echo "Production deployment requested."
  echo "Cluster: ${ORCHESTRYX_ECS_CLUSTER_NAME:-not-required-for-images-target}"
  read -r -p "Type 'deploy prod' to continue: " confirmation
  if [[ "${confirmation}" != "deploy prod" ]]; then
    echo "Aborted."
    exit 1
  fi
}

print_plan() {
  cat <<EOF
Deploy target: ${TARGET}
Environment: ${ORCHESTRYX_ENV}
AWS region: ${AWS_REGION}
AWS account: ${AWS_ACCOUNT_ID}
ECS cluster: ${ORCHESTRYX_ECS_CLUSTER_NAME:-not-required-for-images-target}
API service: ${ORCHESTRYX_API_SERVICE_NAME:-not-required-for-images-target}
Worker service: ${ORCHESTRYX_WORKER_SERVICE_NAME:-not-required-for-images-target}
API ECR repo: ${ORCHESTRYX_API_ECR_REPO_URI}
Worker ECR repo: ${ORCHESTRYX_WORKER_ECR_REPO_URI}
Image tag: ${IMAGE_TAG}
Wait for stability: ${WAIT_FOR_STABILITY}
EOF
}

login_ecr() {
  local registry
  registry="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
  echo "Logging in to ECR registry ${registry}..."
  aws ecr get-login-password --region "${AWS_REGION}" \
    | docker login --username AWS --password-stdin "${registry}"
}

update_service() {
  local service_name="$1"

  echo "Forcing ECS redeployment for ${service_name}..."
  aws ecs update-service \
    --cluster "${ORCHESTRYX_ECS_CLUSTER_NAME}" \
    --service "${service_name}" \
    --force-new-deployment \
    --region "${AWS_REGION}" >/dev/null

  if [[ "${WAIT_FOR_STABILITY}" == "true" ]]; then
    echo "Waiting for ${service_name} to become stable..."
    aws ecs wait services-stable \
      --cluster "${ORCHESTRYX_ECS_CLUSTER_NAME}" \
      --services "${service_name}" \
      --region "${AWS_REGION}"
  fi
}

build_push_api() {
  local image="orchestryx-api:${IMAGE_TAG}"
  local remote_image="${ORCHESTRYX_API_ECR_REPO_URI}:${IMAGE_TAG}"

  echo "Building API image..."
  docker build -f Dockerfile -t "${image}" .

  echo "Tagging API image as ${remote_image}..."
  docker tag "${image}" "${remote_image}"

  echo "Pushing API image..."
  docker push "${remote_image}"
}

deploy_api() {
  build_push_api
  update_service "${ORCHESTRYX_API_SERVICE_NAME}"
}

build_push_worker() {
  local image="orchestryx-worker:${IMAGE_TAG}"
  local remote_image="${ORCHESTRYX_WORKER_ECR_REPO_URI}:${IMAGE_TAG}"

  echo "Building worker image..."
  docker build -f Dockerfile.worker -t "${image}" .

  echo "Tagging worker image as ${remote_image}..."
  docker tag "${image}" "${remote_image}"

  echo "Pushing worker image..."
  docker push "${remote_image}"
}

deploy_worker() {
  build_push_worker
  update_service "${ORCHESTRYX_WORKER_SERVICE_NAME}"
}

require_command aws
require_command docker

if [[ -z "${AWS_REGION:-}" && "${ORCHESTRYX_ENV}" != "prod" ]]; then
  AWS_REGION="eu-central-1"
  export AWS_REGION
fi
if [[ -z "${AWS_ACCOUNT_ID:-}" ]]; then
  AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
  export AWS_ACCOUNT_ID
fi

require_var AWS_REGION
require_var AWS_ACCOUNT_ID
require_var ORCHESTRYX_API_ECR_REPO_URI
require_var ORCHESTRYX_WORKER_ECR_REPO_URI
if [[ "${TARGET}" != "images" ]]; then
  require_var ORCHESTRYX_ECS_CLUSTER_NAME
  require_var ORCHESTRYX_API_SERVICE_NAME
  require_var ORCHESTRYX_WORKER_SERVICE_NAME
fi

print_plan
confirm_prod
login_ecr

case "${TARGET}" in
  api) deploy_api ;;
  worker) deploy_worker ;;
  images)
    build_push_api
    build_push_worker
    ;;
  all)
    deploy_api
    deploy_worker
    ;;
esac

echo "Deployment complete."
