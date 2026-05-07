# ──────────────────────────────────────────────────────────────────────
# LabFlag model
# ──────────────────────────────────────────────────────────────────────
# WHY THIS EXISTS:
#   The cahier de charge (Section 5) requires a `lab_flags` table that
#   stores a hashed version of the flag for each lab template.
#
# HOW IT WORKS:
#   When a user exploits a lab and finds the flag (e.g. in /root/flag.txt),
#   they submit it via the frontend.  The API hashes the submitted value
#   and compares it against the hash stored here.
#
#   We store hashes (not plain text) so that even if the database leaks,
#   the actual flag values are not exposed.
#
# RELATIONSHIP:
#   Each lab template can have exactly one flag.
#   template_id is a foreign key to lab_templates.id.
# ──────────────────────────────────────────────────────────────────────

from sqlalchemy import Column, String
from apps.api.database import Base
import uuid


class LabFlag(Base):
    """
    Stores the hashed flag for each lab template.

    One row per template.  The flag_hash is a SHA-256 hex digest of the
    correct flag string.  Submissions are validated by hashing the user's
    input and comparing it to this value.
    """

    __tablename__ = "lab_flags"

    # ── Primary key ─────────────────────────────────────────────────
    # Auto-generated UUID, consistent with other models.
    id = Column(
        String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    # ── Which lab template this flag belongs to ─────────────────────
    # One flag per template.  If a template has no row here, flag
    # submission is disabled for that lab.
    template_id = Column(String, nullable=False, unique=True, index=True)

    # ── The SHA-256 hash of the correct flag ────────────────────────
    # Example: sha256("ORCHESTRYX{sql_injection_success}") = "a1b2c3..."
    # We never store the plain-text flag in the database.
    flag_hash = Column(String, nullable=False)
