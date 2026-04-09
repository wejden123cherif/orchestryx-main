from fastapi import FastAPI, Depends
from app.database import engine, Base
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


# Protected test route — requires valid JWT
@app.get("/me")
async def me(user=Depends(get_current_user)):
    return {
        "sub": user["sub"],
        "username": user["username"]
    }