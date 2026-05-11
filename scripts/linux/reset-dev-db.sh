#!/usr/bin/env bash
# DESTRUCTIVE — DEV ENVIRONMENT ONLY.
#
# Drops and recreates the public schema in the Aurora dev database, erasing all
# tables, indexes, and data.  Run this when the database is in a state that
# cannot be fixed by normal Alembic downgrade (e.g. a failed partial migration
# or a corrupted schema left by a previous bad migration).
#
# After this script completes, run the migration task to rebuild the schema:
#   ./scripts/linux/run-migrations.sh
#
# DO NOT run against staging or production.  The script will refuse if
# ORCHESTRYX_ENV is set to anything other than "dev".
#
# Usage:
#   ./scripts/linux/reset-dev-db.sh
#   ./scripts/linux/reset-dev-db.sh --force   # skip the confirmation prompt
set -euo pipefail

FORCE=false
for arg in "$@"; do
  [[ "${arg}" == "--force" ]] && FORCE=true
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${script_dir}/../.." && pwd)"
cd "${ROOT_DIR}"

# ── Load generated env ────────────────────────────────────────────────────────
ENV_FILE=".env.dev.generated"
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

# ── Safety gate ───────────────────────────────────────────────────────────────
ORCH_ENV="${ORCHESTRYX_ENV:-dev}"

if [[ "${ORCH_ENV}" != "dev" ]]; then
  echo "ABORT: ORCHESTRYX_ENV is '${ORCH_ENV}'. This script only runs against dev." >&2
  exit 1
fi

CLUSTER="${ORCHESTRYX_ECS_CLUSTER_NAME:-orchestryx-dev}"
TASK_ARN="${ORCHESTRYX_MIGRATION_TASK_ARN:-}"
SG_ID="${ORCHESTRYX_API_SG_ID:-}"
SUBNETS="${ORCHESTRYX_PRIVATE_SUBNET_IDS:-}"
REGION="${AWS_REGION:-eu-central-1}"

[[ -z "${TASK_ARN}" ]]  && { echo "Error: ORCHESTRYX_MIGRATION_TASK_ARN not set. Run export_env.py first." >&2; exit 1; }
[[ -z "${SG_ID}" ]]     && { echo "Error: ORCHESTRYX_API_SG_ID not set. Run export_env.py first." >&2; exit 1; }
[[ -z "${SUBNETS}" ]]   && { echo "Error: ORCHESTRYX_PRIVATE_SUBNET_IDS not set. Run export_env.py first." >&2; exit 1; }

SUBNETS_ARG="$(echo "${SUBNETS}" | tr ',' '\n' | head -2 | tr '\n' ',' | sed 's/,$//')"

# ── Confirmation ──────────────────────────────────────────────────────────────
echo ""
echo "WARNING: This will DROP SCHEMA public CASCADE on the Aurora dev database."
echo "All tables, indexes, and data will be permanently deleted."
echo ""
echo "Cluster:  ${CLUSTER}"
echo "Task def: ${TASK_ARN}"
echo "Region:   ${REGION}"
echo ""

if [[ "${FORCE}" != "true" ]]; then
  read -r -p "Type 'reset dev db' to confirm: " answer
  if [[ "${answer}" != "reset dev db" ]]; then
    echo "Aborted."
    exit 0
  fi
fi

# ── Python reset script (runs inside the migration container) ─────────────────
# Uses asyncpg/SQLAlchemy already present in the API image.
# DATABASE_URL and DB_SSL_MODE are injected from the runtime secret.
RESET_SCRIPT='
import os, asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def main():
    url = os.environ["DATABASE_URL"]
    if not url.startswith("postgresql+asyncpg://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    ssl_mode = os.environ.get("DB_SSL_MODE", "require")
    connect_args = {} if ssl_mode == "disable" else {"ssl": ssl_mode}
    engine = create_async_engine(url, connect_args=connect_args)
    stmts = [
        "DROP SCHEMA public CASCADE",
        "CREATE SCHEMA public",
        "GRANT ALL ON SCHEMA public TO public",
        "GRANT ALL ON SCHEMA public TO postgres",
    ]
    async with engine.begin() as conn:
        for stmt in stmts:
            print(f"Executing: {stmt}")
            await conn.execute(text(stmt))
    await engine.dispose()
    print("Schema reset complete. Run the migration task next.")

asyncio.run(main())
'

# ── Build ECS overrides ───────────────────────────────────────────────────────
OVERRIDE_JSON="$(python3 -c "
import json, sys
script = sys.stdin.read()
print(json.dumps({
    'containerOverrides': [{
        'name': 'migrate',
        'command': ['python', '-c', script]
    }]
}))
" <<< "${RESET_SCRIPT}")"

# ── Run the one-off task ──────────────────────────────────────────────────────
echo "Starting schema reset task..."

RUN_OUTPUT="$(aws ecs run-task \
  --cluster "${CLUSTER}" \
  --task-definition "${TASK_ARN}" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS_ARG}],securityGroups=[${SG_ID}],assignPublicIp=DISABLED}" \
  --overrides "${OVERRIDE_JSON}" \
  --count 1 \
  --region "${REGION}")"

RUNNING_TASK_ARN="$(echo "${RUN_OUTPUT}" | python3 -c "import sys,json; data=json.load(sys.stdin); t=data.get('tasks',[]); print(t[0]['taskArn'] if t else '')")"

if [[ -z "${RUNNING_TASK_ARN}" ]]; then
  echo "Error: No task started." >&2
  echo "${RUN_OUTPUT}" | python3 -c "import sys,json; data=json.load(sys.stdin); [print(f) for f in data.get('failures',[])]" >&2
  exit 1
fi

echo "Reset task started: ${RUNNING_TASK_ARN}"
echo "Waiting for task to complete..."

aws ecs wait tasks-stopped \
  --cluster "${CLUSTER}" \
  --tasks "${RUNNING_TASK_ARN}" \
  --region "${REGION}"

TASK_OUTPUT="$(aws ecs describe-tasks \
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

CODE="$(echo "${TASK_OUTPUT}" | head -1)"
REASON="$(echo "${TASK_OUTPUT}" | tail -1)"

echo ""
if [[ "${CODE}" == "0" ]]; then
  echo "Schema reset completed successfully."
  echo ""
  echo "Next steps:"
  echo "  1. Run migrations:  ./scripts/linux/run-migrations.sh"
  echo "  2. Restart API:     ORCHESTRYX_ENV=dev ./scripts/linux/deploy.sh api"
  echo "  3. Verify:          curl http://\${ORCHESTRYX_API_ALB_DNS}/ready"
else
  echo "Reset task FAILED. Exit code: ${CODE}" >&2
  [[ -n "${REASON}" ]] && echo "Stop reason: ${REASON}" >&2
  echo "" >&2
  echo "Check CloudWatch logs:" >&2
  echo "  aws logs tail /ecs/orchestryx-dev-api --since 15m --region ${REGION}" >&2
  exit 1
fi
