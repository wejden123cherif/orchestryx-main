"""
Orchestryx FastAPI application entry point.

Schema management
-----------------
Database schema is now managed exclusively by Alembic.  The old startup()
handler that ran ALTER TABLE statements and called Base.metadata.create_all()
has been removed.  Run migrations before starting the API:

    alembic upgrade head          # local / CI
    # or via docker-compose:
    docker compose run --rm migrate

Seed data
---------
Lab templates and flags are still upserted on startup so that catalog
changes in seeds.py are reflected immediately without a separate migration.
This is intentional: seed data is catalog configuration, not schema.
"""

import logging

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.api import admin, auth, catalog, labs
from apps.api.config import CORS_ALLOWED_ORIGINS
from apps.api.database import get_db
from apps.api.middleware.auth import get_current_user
# Import ALL models so any code that references Base.metadata sees every table.
from apps.api.models import (  # noqa: F401
    CreditTransaction,
    LabEvent,
    LabFlag,
    LabInstance,
    LabTemplate,
    User,
)
from apps.api.models.lab_flag import LabFlag
from apps.api.models.lab_template import LabTemplate
from apps.api.models.user import User
from apps.api.seeds import LAB_FLAGS, LAB_TEMPLATES

logger = logging.getLogger(__name__)

app = FastAPI(title="Orchestryx API")

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _copy_seed_columns(target: object, seed: object, columns: list[str]) -> None:
    """Copy catalog seed values onto an existing DB row by column name."""
    for column in columns:
        setattr(target, column, getattr(seed, column))


# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup() -> None:
    """Upsert lab templates and flags from seeds.py.

    Schema migrations are handled by Alembic and must be run before the API
    starts (see docker-compose.yml 'migrate' service or the README).  This
    handler only manages seed *data* — it never touches the schema.
    """
    from sqlalchemy.ext.asyncio import AsyncSession as _AsyncSession

    from apps.api.database import engine as _engine

    try:
        async with _AsyncSession(_engine) as session:
            # ── Lab templates ────────────────────────────────────────────
            result = await session.execute(select(LabTemplate))
            existing_templates = {t.id: t for t in result.scalars().all()}
            inserted_templates = 0
            updated_templates = 0

            for seed_template in LAB_TEMPLATES:
                existing = existing_templates.get(seed_template.id)
                if existing is None:
                    session.add(seed_template)
                    inserted_templates += 1
                    continue

                _copy_seed_columns(
                    existing,
                    seed_template,
                    [
                        "title",
                        "category",
                        "difficulty",
                        "description",
                        "credits_cost",
                        "ttl_hours",
                        "docker_image_uri",
                        "cdk_stack_class",
                        "instance_type",
                        "challenge_port",
                        "challenge_path",
                        "is_active",
                    ],
                )
                updated_templates += 1

            if inserted_templates or updated_templates:
                await session.commit()
                logger.info(
                    "Synchronized lab templates: %s inserted, %s updated",
                    inserted_templates,
                    updated_templates,
                )

            # ── Lab flags ────────────────────────────────────────────────
            flag_result = await session.execute(select(LabFlag))
            existing_flags = {f.template_id: f for f in flag_result.scalars().all()}
            inserted_flags = 0
            updated_flags = 0

            for seed_flag in LAB_FLAGS:
                existing = existing_flags.get(seed_flag.template_id)
                if existing is None:
                    session.add(seed_flag)
                    inserted_flags += 1
                    continue

                existing.flag_hash = seed_flag.flag_hash
                updated_flags += 1

            if inserted_flags or updated_flags:
                await session.commit()
                logger.info(
                    "Synchronized lab flags: %s inserted, %s updated",
                    inserted_flags,
                    updated_flags,
                )

    except SQLAlchemyError:
        logger.exception(
            "Seed data synchronization failed on startup. "
            "Ensure 'alembic upgrade head' has been run before starting the API."
        )
        raise


# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(catalog.router)
app.include_router(labs.router)
app.include_router(admin.router)


# ── Health & profile endpoints ────────────────────────────────────────────────

@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/me")
async def me(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    cognito_sub = user.get("sub")
    if not cognito_sub:
        raise HTTPException(status_code=401, detail="Invalid authentication token")

    try:
        result = await db.execute(select(User).where(User.cognito_sub == cognito_sub))
        db_user = result.scalar_one_or_none()
    except SQLAlchemyError:
        logger.exception("Database query failed while loading current user")
        raise HTTPException(status_code=500, detail="Database query failed")

    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found in database")

    return {
        "id": db_user.id,
        "email": db_user.email,
        "credits_balance": db_user.credits_balance,
        "subscription_tier": db_user.subscription_tier,
        "role": db_user.role,
        "is_disabled": db_user.is_disabled,
        "max_active_labs": db_user.max_active_labs,
        "created_at": db_user.created_at,
    }
