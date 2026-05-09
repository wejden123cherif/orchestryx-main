"""
Alembic environment configuration for Orchestryx.

Supports both offline (SQL script generation) and online (live DB) modes.
Uses the same DATABASE_URL as the FastAPI application so there is a single
source of truth for the connection string.

The async engine is wrapped with run_sync so Alembic's synchronous migration
runner can drive it without requiring a separate sync connection string.
"""

import asyncio
import os
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# ---------------------------------------------------------------------------
# Alembic Config object — gives access to values in alembic.ini.
# ---------------------------------------------------------------------------
config = context.config

# Interpret the config file for Python logging if present.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ---------------------------------------------------------------------------
# Import all models so their metadata is visible to autogenerate.
# The import order does not matter; SQLAlchemy resolves FK dependencies.
# ---------------------------------------------------------------------------
# Ensure the project root is on sys.path when running `alembic` from the
# repo root (the normal case).  This is a no-op when the package is already
# importable.
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from apps.api.database import Base  # noqa: E402  (must come after sys.path fix)
import apps.api.models  # noqa: E402, F401  (registers all ORM classes on Base)

target_metadata = Base.metadata

# ---------------------------------------------------------------------------
# Read the DATABASE_URL from the environment (same as apps/api/config.py).
# Alembic needs a *synchronous* URL for offline mode and an async-compatible
# URL for online mode.  We derive both from the single DATABASE_URL env var.
# ---------------------------------------------------------------------------

def _get_sync_url() -> str:
    """Return a synchronous psycopg2 URL for offline SQL generation."""
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        raise RuntimeError(
            "DATABASE_URL environment variable is not set. "
            "Export it or add it to your .env file before running Alembic."
        )
    # Strip the asyncpg driver if present so psycopg2 can be used for offline
    # script generation (Alembic does not need a live connection in that mode).
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


def _get_async_url() -> str:
    """Return an asyncpg URL for the online migration runner."""
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        raise RuntimeError(
            "DATABASE_URL environment variable is not set. "
            "Export it or add it to your .env file before running Alembic."
        )
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


# ---------------------------------------------------------------------------
# Offline mode — emit SQL to stdout without a live DB connection.
# ---------------------------------------------------------------------------

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL and not an Engine, though an
    Engine is acceptable here as well.  By skipping the Engine creation we
    don't even need a DBAPI to be available.
    """
    url = _get_sync_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # Emit a BEGIN/COMMIT around each migration so the SQL script is
        # transactional when piped directly to psql.
        transaction_per_migration=True,
    )

    with context.begin_transaction():
        context.run_migrations()


# ---------------------------------------------------------------------------
# Online mode — connect to the live database and apply migrations.
# ---------------------------------------------------------------------------

def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        # Compare server defaults so Alembic can detect DEFAULT value changes.
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Create an async engine and run migrations through a sync wrapper."""
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = _get_async_url()

    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
