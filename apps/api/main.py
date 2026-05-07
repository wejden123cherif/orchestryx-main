import logging

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
# FIX: Import `text` alongside `select`.
# SQLAlchemy 2.x requires raw SQL strings to be wrapped in text() before
# passing them to connection.execute().  Without text(), the ALTER TABLE
# migration statements fail silently and the new columns never get created,
# which causes the subsequent SELECT to crash with:
#   "column lab_templates.challenge_port does not exist"
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.api import auth, catalog, labs
from apps.api.config import CORS_ALLOWED_ORIGINS
from apps.api.database import engine, Base, get_db
from apps.api.middleware.auth import get_current_user
# Import ALL models so Base.metadata.create_all() sees every table.
# CreditTransaction = append-only credit ledger
# LabFlag = SHA-256 hashed flags per template
from apps.api.models import LabInstance, LabTemplate, User, CreditTransaction, LabFlag

# Import seed data: templates (lab definitions) + flags (correct answers)
from apps.api.seeds import LAB_TEMPLATES, LAB_FLAGS


logger = logging.getLogger(__name__)

app = FastAPI(title="Orchestryx API")


def _copy_seed_columns(target, seed, columns: list[str]) -> None:
    """Copy catalog seed values onto an existing DB row by column name."""
    for column in columns:
        setattr(target, column, getattr(seed, column))

# Allow frontend to talk to backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.on_event("startup")
async def startup():
    """
    FastAPI startup event handler that:
    1. Creates database tables if they don't exist
    2. Migrates old schema by adding missing columns (challenge_port, challenge_path)
    3. Seeds default lab templates if the table is empty
    """
    try:
        # STEP 1: Create all tables defined in the SQLAlchemy models
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            
            # STEP 2: Add missing columns to lab_templates if they don't exist
            # This handles the case where the table existed before challenge_port/challenge_path were added
            # We check column existence before trying to add, to avoid "already exists" errors
            logger.info("Checking for missing columns in lab_templates table...")
            
            # PostgreSQL-safe way to add challenge_port column.
            # FIX: Wrap the raw SQL in text() so SQLAlchemy 2.x can execute it.
            # Previously this was a bare string, which made conn.execute() raise
            # an error that was silently swallowed by the except block below.
            try:
                await conn.execute(text("""
                    -- Check if column exists before adding to lab_templates table
                    -- This prevents duplicate column errors if the schema is already up-to-date
                    ALTER TABLE lab_templates 
                    ADD COLUMN IF NOT EXISTS challenge_port INTEGER NOT NULL DEFAULT 3000;
                """))
                logger.info("Ensured challenge_port column exists in lab_templates")
            except Exception as e:
                logger.debug(f"Challenge port migration info: {e}")

            # PostgreSQL-safe way to add challenge_path column.
            # FIX: Same text() wrapper applied here for consistency.
            try:
                await conn.execute(text("""
                    -- Check if column exists before adding to lab_templates table
                    -- This prevents duplicate column errors if the schema is already up-to-date
                    ALTER TABLE lab_templates 
                    ADD COLUMN IF NOT EXISTS challenge_path VARCHAR NOT NULL DEFAULT '/';
                """))
                logger.info("Ensured challenge_path column exists in lab_templates")
            except Exception as e:
                logger.debug(f"Challenge path migration info: {e}")
            
            # Commit the schema changes to the database
            await conn.commit()

        # STEP 3: Upsert lab templates and flags from code seeds.
        # Earlier versions only inserted when the tables were empty, which
        # meant new labs never appeared in existing developer databases.
        async with AsyncSession(engine) as session:
            # 3a. Add missing templates and refresh existing template metadata.
            result = await session.execute(select(LabTemplate))
            existing_templates = {
                template.id: template for template in result.scalars().all()
            }
            inserted_templates = 0
            updated_templates = 0

            for seed_template in LAB_TEMPLATES:
                existing_template = existing_templates.get(seed_template.id)
                if existing_template is None:
                    session.add(seed_template)
                    inserted_templates += 1
                    continue

                _copy_seed_columns(
                    existing_template,
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

            # 3b. Add missing flags and refresh hashes for existing templates.
            # Each flag is a SHA-256 hash of the correct answer.
            # The plain-text flag only lives inside the lab VM.
            flag_result = await session.execute(select(LabFlag))
            existing_flags = {
                flag.template_id: flag for flag in flag_result.scalars().all()
            }
            inserted_flags = 0
            updated_flags = 0

            for seed_flag in LAB_FLAGS:
                existing_flag = existing_flags.get(seed_flag.template_id)
                if existing_flag is None:
                    session.add(seed_flag)
                    inserted_flags += 1
                    continue

                existing_flag.flag_hash = seed_flag.flag_hash
                updated_flags += 1

            if inserted_flags or updated_flags:
                await session.commit()
                logger.info(
                    "Synchronized lab flags: %s inserted, %s updated",
                    inserted_flags,
                    updated_flags,
                )
    except SQLAlchemyError as exc:
        logger.exception("Database startup initialization failed")
        raise

app.include_router(auth.router)
app.include_router(catalog.router)
app.include_router(labs.router)

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/me")
async def me(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    cognito_sub = user.get("sub")
    if not cognito_sub:
        raise HTTPException(status_code=401, detail="Invalid authentication token")

    try:
        result = await db.execute(
            select(User).where(User.cognito_sub == cognito_sub)
        )
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
        "created_at": db_user.created_at
    }
