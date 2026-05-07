import os
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://orchestryx:password@localhost:5432/orchestryx')
if DATABASE_URL.startswith('postgresql+asyncpg://'):
    ASYNC_DATABASE_URL = DATABASE_URL
else:
    ASYNC_DATABASE_URL = DATABASE_URL.replace('postgresql://', 'postgresql+asyncpg://', 1)

engine = create_async_engine(ASYNC_DATABASE_URL)

async def main():
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='lab_templates' ORDER BY ordinal_position"))
        print([row[0] for row in result.fetchall()])

asyncio.run(main())
