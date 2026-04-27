from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import DATABASE_URL, DB_SSL_MODE, SQL_ECHO

if DATABASE_URL.startswith("postgresql+asyncpg://"):
    ASYNC_DATABASE_URL = DATABASE_URL
else:
    ASYNC_DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

connect_args = {}
if DB_SSL_MODE != "disable":
    connect_args["ssl"] = DB_SSL_MODE

engine = create_async_engine(
    ASYNC_DATABASE_URL,
    echo=SQL_ECHO,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_size=5,
    max_overflow=10,
    connect_args=connect_args,
)

AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)

Base = declarative_base()
# app.main currently uses Base.metadata.create_all() on startup for MVP speed.
# Replace that with Alembic migrations before real production deployments.

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
