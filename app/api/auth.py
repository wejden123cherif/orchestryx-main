from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from app.services.cognito import register_user, login_user, confirm_email, refresh_token

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
async def login(body: LoginRequest):
    try:
        result = login_user(body.email, body.password)
        return result
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