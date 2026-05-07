# ──────────────────────────────────────────────────────────────────────
# CreditTransaction model
# ──────────────────────────────────────────────────────────────────────
# WHY THIS EXISTS:
#   The cahier de charge (Section 5) requires an append-only ledger for
#   all credit movements.  Instead of just changing `users.credits_balance`
#   directly, every credit change (deduction on lab start, refund on failure,
#   top-up, etc.) is recorded here as a row with a signed delta.
#
# HOW IT WORKS:
#   +5.0  → user received 5 credits  (signup bonus, top-up, refund)
#   -1.0  → user spent 1 credit      (lab start)
#
#   The authoritative balance can always be reconstructed:
#       SELECT SUM(delta) FROM credit_transactions WHERE user_id = ?
#
#   We still keep `users.credits_balance` as a fast-read cache, but this
#   table is the source of truth for auditing and billing disputes.
# ──────────────────────────────────────────────────────────────────────

from sqlalchemy import Column, String, Float, DateTime, Text
from sqlalchemy.sql import func
from apps.api.database import Base
import uuid


class CreditTransaction(Base):
    """
    Append-only ledger that records every credit movement for a user.

    Each row represents one event: a lab start (negative delta), a refund,
    a signup bonus, or a manual top-up.  Rows are never updated or deleted.
    """

    __tablename__ = "credit_transactions"

    # ── Primary key ─────────────────────────────────────────────────
    # Auto-generated UUID, same pattern as User and LabInstance.
    id = Column(
        String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    # ── Who this transaction belongs to ─────────────────────────────
    # References the users table.  Every transaction belongs to exactly
    # one user.  We use String instead of ForeignKey here so failed
    # inserts don't cascade and break the ledger.
    user_id = Column(String, nullable=False, index=True)

    # ── The credit change ───────────────────────────────────────────
    # Positive = credits added (bonus, refund, top-up)
    # Negative = credits spent (lab start, extend TTL)
    delta = Column(Float, nullable=False)

    # ── Human-readable explanation ──────────────────────────────────
    # Examples:
    #   "Lab start: web-sqli-01"
    #   "Signup bonus"
    #   "Refund: provisioning failed"
    reason = Column(Text, nullable=False)

    # ── When it happened ────────────────────────────────────────────
    # Postgres fills this automatically on INSERT.
    created_at = Column(DateTime(timezone=True), server_default=func.now())
