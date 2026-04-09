from fastapi import FastAPI, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import engine, Base, get_db
from app.models import User
from app.api import auth
from app.middleware.auth import get_current_user

app = FastAPI(title="Orchestryx API")

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

app.include_router(auth.router)

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/me")
async def me(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(User.cognito_sub == user["sub"])
    )
    db_user = result.scalar_one_or_none()

    if db_user is None:
        return {"error": "User not found in database"}

    return {
        "id": db_user.id,
        "email": db_user.email,
        "credits_balance": db_user.credits_balance,
        "subscription_tier": db_user.subscription_tier,
        "created_at": db_user.created_at
    }
