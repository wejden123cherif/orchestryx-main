import logging

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import auth, catalog, labs
from app.config import CORS_ALLOWED_ORIGINS
from app.database import engine, Base, get_db
from app.middleware.auth import get_current_user
from app.models import LabInstance, LabTemplate, User
from app.seeds import LAB_TEMPLATES

logger = logging.getLogger(__name__)

app = FastAPI(title="Orchestryx API")

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
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        # Seed lab templates if table is empty.
        async with AsyncSession(engine) as session:
            result = await session.execute(select(LabTemplate))
            existing = result.scalars().all()
            if not existing:
                session.add_all(LAB_TEMPLATES)
                await session.commit()
                logger.info("Seeded %s lab templates", len(LAB_TEMPLATES))
    except SQLAlchemyError:
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
