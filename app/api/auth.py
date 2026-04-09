from fastapi import APIRouter, HTTPException, Depends
from jose import jwt
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.cognito import register_user, login_user, confirm_email, refresh_token
from app.services.user import get_or_create_user

router = APIRouter(prefix="/auth", tags=["auth"])


# ─── Request Schemas ───

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ConfirmRequest(BaseModel):
    email: EmailStr
    code: str


class RefreshRequest(BaseModel):
    refresh_token: str


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
