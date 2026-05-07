from sqlalchemy import Boolean, Column, String, Float, Integer, DateTime
from sqlalchemy.sql import func
from apps.api.database import Base
import uuid


class User(Base):
    """
    Represents the 'users' table in the database.
    Every user who registers on Orchestryx gets one row here.
    """

    # The actual table name in Postgres
    __tablename__ = "users"

    # Primary key — a unique ID auto-generated for every user
    # We use UUID (e.g. "a1b2c3d4-e5f6-...") instead of 1, 2, 3
    # because UUIDs are harder to guess and safer for APIs
    id = Column(
        String,
        primary_key=True,
        default=lambda: str(uuid.uuid4())  # auto-generate on insert
    )

    # The user's email address
    # unique=True    → no two users can share the same email
    # nullable=False → this field is required, cannot be empty
    # index=True     → makes searching by email fast (Postgres creates an index)
    email = Column(String, unique=True, nullable=False, index=True)

    # The ID that AWS Cognito assigns to this user on their side
    # We store it here to link our User row to the Cognito identity
    # nullable=True → it's filled in after registration, not at creation
    cognito_sub = Column(String, unique=True, nullable=True)

    # How many credits the user has available to spend on labs
    # New users start with 5 free credits
    credits_balance = Column(Float, default=5.0)

    # The user's plan: "free", "pro", etc.
    # Controls how many labs they can run simultaneously
    subscription_tier = Column(String, default="free")

    # Platform role. Admin endpoints also accept Cognito group claims, but this
    # database field lets operators grant access without changing Cognito setup.
    role = Column(String, nullable=False, default="user")

    # Disabled accounts keep their historical usage and credit ledger but cannot
    # start new labs.
    is_disabled = Column(Boolean, nullable=False, default=False)

    # Optional per-user override. Null means use the configured/tier default.
    max_active_labs = Column(Integer, nullable=True)

    # Timestamp of when the account was created
    # server_default=func.now() means Postgres sets this automatically
    # We never pass this manually — the DB handles it
    created_at = Column(DateTime(timezone=True), server_default=func.now())
