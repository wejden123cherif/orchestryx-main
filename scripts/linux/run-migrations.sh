#!/usr/bin/env bash
# Run the Alembic migration task inside ECS Fargate (one-off, no service created).
#
# The task uses the API image and security group so it has identical DB access to
# the API service.  Run this BEFORE the API service starts and after every
# schema migration is added.
#
# Prerequisites:
#   - EcsPlatformStack deployed
#   - export_env.py has been run (produces .env.dev.generated)
#   - DATABASE_URL secret is populated in Secrets Manager
#
# Usage:
#   ./scripts/linux/run-migrations.sh
#   ENV=staging ./scripts/linux/run-migrations.sh
set -euo pipefail

ENV="${ENV:-dev}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${script_dir}/../.." && pwd)"
cd "${ROOT_DIR}"

ENV_FILE=".env.${ENV}.generated"
if [[ -f "${ENV_FILE}" ]]; then
  echo "Loading environment from ${ENV_FILE}"
  while IFS= read -r line || [[ -n "${line}" ]]; do
    [[ -z "${line}" || "${line}" =~ ^[[:space:]]*# || "${line}" != *=* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    if [[ "${key}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ && -z "${!key:-}" ]]; then
      value="${value%$'\r'}"
      value="${value%\"}" ; value="${value#\"}"
      value="${value%\'}" ; value="${value#\'}"
      export "${key}=${value}"
    fi
  done < "${ENV_FILE}"
fi

CLUSTER="${ORCHESTRYX_ECS_CLUSTER_NAME:-orchestryx-${ENV}}"
TASK_ARN="${ORCHESTRYX_MIGRATION_TASK_ARN:-}"
SG_ID="${ORCHESTRYX_API_SG_ID:-}"
SUBNETS="${ORCHESTRYX_PRIVATE_SUBNET_IDS:-}"
REGION="${AWS_REGION:-eu-central-1}"

[[ -z "${TASK_ARN}" ]]  && { echo "Error: ORCHESTRYX_MIGRATION_TASK_ARN not set. Run export_env.py first." >&2; exit 1; }
[[ -z "${SG_ID}" ]]     && { echo "Error: ORCHESTRYX_API_SG_ID not set. Run export_env.py first." >&2; exit 1; }
[[ -z "${SUBNETS}" ]]   && { echo "Error: ORCHESTRYX_PRIVATE_SUBNET_IDS not set. Run export_env.py first." >&2; exit 1; }

# Use the first two private subnets for AZ redundancy.
SUBNETS_ARG="$(echo "${SUBNETS}" | tr ',' '\n' | head -2 | tr '\n' ',' | sed 's/,$//')"

echo ""
echo "Migration task parameters:"
echo "  Cluster:        ${CLUSTER}"
echo "  Task def:       ${TASK_ARN}"
echo "  Security group: ${SG_ID}"
echo "  Subnets:        ${SUBNETS_ARG}"
echo "  Region:         ${REGION}"
echo ""

RUN_OUTPUT="$(aws ecs run-task \
  --cluster "${CLUSTER}" \
  --task-definition "${TASK_ARN}" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS_ARG}],securityGroups=[${SG_ID}],assignPublicIp=DISABLED}" \
  --count 1 \
  --region "${REGION}")"

RUNNING_TASK_ARN="$(echo "${RUN_OUTPUT}" | python3 -c "import sys,json; data=json.load(sys.stdin); t=data.get('tasks',[]); print(t[0]['taskArn'] if t else '')")"

if [[ -z "${RUNNING_TASK_ARN}" ]]; then
  echo "Error: No task started." >&2
  echo "${RUN_OUTPUT}" | python3 -c "import sys,json; data=json.load(sys.stdin); [print(f) for f in data.get('failures',[])]" >&2
  exit 1
fi

echo "Task started: ${RUNNING_TASK_ARN}"
echo "Waiting for task to complete (up to 10 minutes)..."

aws ecs wait tasks-stopped \
  --cluster "${CLUSTER}" \
  --tasks "${RUNNING_TASK_ARN}" \
  --region "${REGION}"

EXIT_CODE="$(aws ecs describe-tasks \
  --cluster "${CLUSTER}" \
  --tasks "${RUNNING_TASK_ARN}" \
  --region "${REGION}" \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
task = data['tasks'][0]
c = next((c for c in task['containers'] if c['name'] == 'migrate'), task['containers'][0])
print(c.get('exitCode', 1))
print(task.get('stoppedReason', ''))
")"

CODE="$(echo "${EXIT_CODE}" | head -1)"
REASON="$(echo "${EXIT_CODE}" | tail -1)"

echo ""
if [[ "${CODE}" == "0" ]]; then
  echo "Migrations completed successfully."
  echo ""
  echo "Next steps:"
  echo "  1. Restart the API service:"
  echo "     aws ecs update-service --cluster ${CLUSTER} --service ${ORCHESTRYX_API_SERVICE_NAME:-orchestryx-${ENV}-api-service} --force-new-deployment --region ${REGION}"
  echo "  2. Check /ready on the ALB to confirm the API is fully operational."
else
  echo "Migration task FAILED. Exit code: ${CODE}" >&2
  [[ -n "${REASON}" ]] && echo "Stop reason: ${REASON}" >&2
  echo "" >&2
  echo "Check CloudWatch logs:" >&2
  echo "  aws logs tail /ecs/orchestryx-${ENV}-api --since 30m --region ${REGION}" >&2
  exit 1
fi
