from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import engine, Base, get_db
from app.api import auth, catalog, labs
from app.middleware.auth import get_current_user
from app.models.lab_template import LabTemplate
from app.models.user import User
from app.seeds import LAB_TEMPLATES
import app.models.user
import app.models.lab_template
import app.models.lab_instance

app = FastAPI(title="Orchestryx API")

# Allow frontend to talk to backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed lab templates if table is empty
    async with AsyncSession(engine) as session:
        result = await session.execute(select(LabTemplate))
        existing = result.scalars().all()
        if not existing:
            session.add_all(LAB_TEMPLATES)
            await session.commit()
            print(f"Seeded {len(LAB_TEMPLATES)} lab templates")

app.include_router(auth.router)
app.include_router(catalog.router)
app.include_router(labs.router)

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
