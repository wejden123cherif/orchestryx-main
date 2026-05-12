import os

from dotenv import load_dotenv

load_dotenv()


class ConfigError(RuntimeError):
    """Raised when required runtime configuration is missing or invalid."""


def _required(name: str) -> str:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        raise ConfigError(f"Missing required environment variable: {name}")
    return value.strip()


def _optional(name: str, default: str) -> str:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return value.strip()


def _bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _csv(name: str, default: str) -> list[str]:
    raw_value = _optional(name, default)
    return [item.strip() for item in raw_value.split(",") if item.strip()]


def _int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise ConfigError(f"Invalid integer environment variable: {name}") from exc


ORCHESTRYX_ENV = _optional("ORCHESTRYX_ENV", "local")


# ── Database ─────────────────────────────────────────────────────────────────
DATABASE_URL = _required("DATABASE_URL")
SQL_ECHO = _bool("SQL_ECHO", default=False)
# Set to 'require' for Aurora production, 'disable' for local Docker Compose.
DB_SSL_MODE = os.getenv("DB_SSL_MODE", "disable")

# ── AWS core ─────────────────────────────────────────────────────────────────
AWS_REGION = _required("AWS_REGION")
# AWS account ID — used to construct ECR URIs and CDK environment.
# Required in production; optional locally (CDK uses CDK_DEFAULT_ACCOUNT as
# a fallback when this is absent).
AWS_ACCOUNT_ID = _optional("AWS_ACCOUNT_ID", "")

# ── Cognito ───────────────────────────────────────────────────────────────────
COGNITO_USER_POOL_ID = _required("COGNITO_USER_POOL_ID")
COGNITO_APP_CLIENT_ID = _required("COGNITO_APP_CLIENT_ID")

# JWKS cache TTL in seconds.  After this many seconds the cached public keys
# are considered stale and will be refreshed on the next request.
# Default: 3600 (1 hour).  Cognito rotates keys infrequently but does rotate.
COGNITO_JWKS_TTL_SECONDS = _int("COGNITO_JWKS_TTL_SECONDS", 3600)

# ── SQS ───────────────────────────────────────────────────────────────────────
SQS_PROVISION_URL = _required("SQS_PROVISION_URL")
SQS_DESTROY_URL = _required("SQS_DESTROY_URL")

# ── API ───────────────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = _csv("CORS_ALLOWED_ORIGINS", "http://localhost:3000")

# ── Celery / SQS queue names ──────────────────────────────────────────────────
PROVISION_QUEUE = _optional("PROVISION_QUEUE", "orchestryx-provision-lab")
DESTROY_QUEUE = _optional("DESTROY_QUEUE", "orchestryx-destroy-lab")

# ── Lab runtime ───────────────────────────────────────────────────────────────
# Lab deployment is currently disabled while the platform itself is moved to
# infra/platform_cdk. Keep /labs/start controlled instead of attempting to
# invoke the removed per-lab CDK path.
LAB_RUNTIME_ENABLED = _bool("LAB_RUNTIME_ENABLED", default=False)
LAB_MAX_ACTIVE_PER_USER = _int("LAB_MAX_ACTIVE_PER_USER", 2)
LAB_PROVISION_TIMEOUT_SECONDS = _int("LAB_PROVISION_TIMEOUT_SECONDS", 900)
LAB_STARTUP_RETRY_SECONDS = _int("LAB_STARTUP_RETRY_SECONDS", 30)
LAB_CLEANUP_STUCK_AFTER_SECONDS = _int("LAB_CLEANUP_STUCK_AFTER_SECONDS", 1200)
LAB_RETENTION_DAYS = _int("LAB_RETENTION_DAYS", 14)
LAB_ECS_CLUSTER = _optional("LAB_ECS_CLUSTER", _optional("AWS_ECS_CLUSTER", "orchestryx"))
LAB_ECS_SUBNET_IDS = _csv("LAB_ECS_SUBNET_IDS", "")
LAB_ECS_SECURITY_GROUP_IDS = _csv("LAB_ECS_SECURITY_GROUP_IDS", "")
LAB_ECS_ASSIGN_PUBLIC_IP = _bool("LAB_ECS_ASSIGN_PUBLIC_IP", default=False)
LAB_ECS_PUBLIC_ACCESS_ENABLED = _bool("LAB_ECS_PUBLIC_ACCESS_ENABLED", default=False)
LAB_ECS_TASK_EXECUTION_ROLE_ARN = _optional("LAB_ECS_TASK_EXECUTION_ROLE_ARN", "")
LAB_ECS_TASK_ROLE_ARN = _optional("LAB_ECS_TASK_ROLE_ARN", "")
LAB_ECS_LOG_GROUP = _optional("LAB_ECS_LOG_GROUP", "/ecs/orchestryx-labs")
LAB_ECS_LOG_STREAM_PREFIX = _optional("LAB_ECS_LOG_STREAM_PREFIX", "lab")
LAB_ECS_CPU = _int("LAB_ECS_CPU", 512)
LAB_ECS_MEMORY_MIB = _int("LAB_ECS_MEMORY_MIB", 1024)
LAB_VPN_CONFIG_SECRET_ID = _optional("LAB_VPN_CONFIG_SECRET_ID", "")
LAB_VPN_CONFIG_INLINE = _optional("LAB_VPN_CONFIG_INLINE", "")
ORCHESTRYX_WIREGUARD_INSTANCE_ID = _optional("ORCHESTRYX_WIREGUARD_INSTANCE_ID", "")
ORCHESTRYX_WIREGUARD_SECURITY_GROUP_ID = _optional("ORCHESTRYX_WIREGUARD_SECURITY_GROUP_ID", "")

# ── AWS monitoring defaults ───────────────────────────────────────────────────
# These mirror the status CLI defaults but can be overridden per environment
# so the admin console is not tied to one account.
AWS_ECS_CLUSTER = _optional("AWS_ECS_CLUSTER", "orchestryx")
AWS_API_SERVICE = _optional("AWS_API_SERVICE", "orchestryx-api-service")
AWS_WORKER_SERVICE = _optional("AWS_WORKER_SERVICE", "orchestryx-worker-service")
AWS_AURORA_CLUSTER = _optional("AWS_AURORA_CLUSTER", "orchestryx-db")
AWS_COGNITO_POOL_ID = _optional("AWS_COGNITO_POOL_ID", COGNITO_USER_POOL_ID)
AWS_API_LOG_GROUP = _optional("AWS_API_LOG_GROUP", "/ecs/orchestryx-api")
AWS_WORKER_LOG_GROUP = _optional("AWS_WORKER_LOG_GROUP", "/ecs/orchestryx-worker")
AWS_ECR_API_REPOSITORY = _optional("AWS_ECR_API_REPOSITORY", "orchestryx-api")
AWS_ECR_WORKER_REPOSITORY = _optional("AWS_ECR_WORKER_REPOSITORY", "orchestryx-worker")
# In ECS tasks AWS_VPC_ID is injected directly by the CDK shared_environment.
# For local dev, fall back to ORCHESTRYX_VPC_ID which export_env.py writes to
# .env.dev.generated so developers who source that file don't need to rename it.
AWS_VPC_ID = _optional("AWS_VPC_ID", _optional("ORCHESTRYX_VPC_ID", ""))
