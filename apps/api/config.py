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


# Database
DATABASE_URL = _required("DATABASE_URL")
SQL_ECHO = _bool("SQL_ECHO", default=False)
# Set to 'require' for Aurora production, 'disable' for local Docker Compose.
DB_SSL_MODE = os.getenv("DB_SSL_MODE", "disable")

# AWS
AWS_REGION = _required("AWS_REGION")
COGNITO_USER_POOL_ID = _required("COGNITO_USER_POOL_ID")
COGNITO_APP_CLIENT_ID = _required("COGNITO_APP_CLIENT_ID")
SQS_PROVISION_URL = _required("SQS_PROVISION_URL")
SQS_DESTROY_URL = _required("SQS_DESTROY_URL")

# API
CORS_ALLOWED_ORIGINS = _csv("CORS_ALLOWED_ORIGINS", "http://localhost:3000")

# Celery / SQS
PROVISION_QUEUE = _optional("PROVISION_QUEUE", "orchestryx-provision-lab")
DESTROY_QUEUE = _optional("DESTROY_QUEUE", "orchestryx-destroy-lab")

# Lab provisioning
CDK_INFRA_PATH = os.getenv("CDK_INFRA_PATH", "infra")
WG_DNS = _optional("WG_DNS", "1.1.1.1")
LAB_MAX_ACTIVE_PER_USER = _int("LAB_MAX_ACTIVE_PER_USER", 2)
LAB_PROVISION_TIMEOUT_SECONDS = _int("LAB_PROVISION_TIMEOUT_SECONDS", 900)
LAB_STARTUP_RETRY_SECONDS = _int("LAB_STARTUP_RETRY_SECONDS", 30)
LAB_CLEANUP_STUCK_AFTER_SECONDS = _int("LAB_CLEANUP_STUCK_AFTER_SECONDS", 1200)
LAB_RETENTION_DAYS = _int("LAB_RETENTION_DAYS", 14)
