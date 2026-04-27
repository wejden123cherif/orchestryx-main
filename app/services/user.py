from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def get_or_create_user(db: AsyncSession, cognito_sub: str, email: str) -> User:
    """
    Find a user by their Cognito sub.
    If they don't exist in our DB yet, create them.
    This is called after every successful login.
    """
    try:
        result = await db.execute(
            select(User).where(User.cognito_sub == cognito_sub)
        )
        user = result.scalar_one_or_none()

        if user is None:
            user = User(
                cognito_sub=cognito_sub,
                email=email,
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
    except SQLAlchemyError:
        await db.rollback()
        raise

    return user
