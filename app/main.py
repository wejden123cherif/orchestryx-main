from fastapi import FastAPI
from app.database import engine, Base
from app.models import User

app = FastAPI(title="Orchestryx API")

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

@app.get("/health")
async def health():
    return {"status": "ok"}
