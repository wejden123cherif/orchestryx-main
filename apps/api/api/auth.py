import logging
from typing import Annotated

from fastapi import APIRouter, HTTPException, Depends
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr, StringConstraints
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.database import get_db
from apps.api.services.cognito import register_user, login_user, confirm_email, refresh_token
from apps.api.services.user import get_or_create_user

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


# ─── Request Schemas ───

Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]
ConfirmationCode = Annotated[str, StringConstraints(min_length=4, max_length=16)]
RefreshToken = Annotated[str, StringConstraints(min_length=20, max_length=4096)]


class RegisterRequest(BaseModel):
    email: EmailStr
    password: Password


class LoginRequest(BaseModel):
    email: EmailStr
    password: Password


class ConfirmRequest(BaseModel):
    email: EmailStr
    code: ConfirmationCode


class RefreshRequest(BaseModel):
    refresh_token: RefreshToken


# ─── Routes ───

@router.post("/register")
async def register(body: RegisterRequest):
    try:
        result = register_user(body.email, body.password)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login")
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    try:
        tokens = login_user(body.email, body.password)

        # Cognito has already authenticated this token pair, so we only need
        # the claims payload here to link the identity into our database.
        id_token_claims = jwt.get_unverified_claims(tokens["id_token"])
        cognito_sub = id_token_claims["sub"]
        email = id_token_claims["email"]

        await get_or_create_user(db, cognito_sub, email)

        return tokens
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except (JWTError, KeyError):
        logger.warning("Cognito login returned an unusable ID token")
        raise HTTPException(status_code=502, detail="Authentication service returned an invalid token")
    except SQLAlchemyError:
        await db.rollback()
        logger.exception("Database write failed while linking Cognito user")
        raise HTTPException(status_code=500, detail="Database write failed")


@router.post("/confirm")
async def confirm(body: ConfirmRequest):
    try:
        result = confirm_email(body.email, body.code)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/refresh")
async def refresh(body: RefreshRequest):
    try:
        result = refresh_token(body.refresh_token)
        return result
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
