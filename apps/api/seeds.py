"""
Lab template and flag seed data for Orchestryx.

ECR image URIs
--------------
Custom lab images (those not on Docker Hub) are stored in ECR.  The URI
format is:

    {AWS_ACCOUNT_ID}.dkr.ecr.{AWS_REGION}.amazonaws.com/{repo}:{tag}

Rather than hardcoding the account ID and region here, we read them from
config at import time.  This means:

* A different AWS account only requires changing AWS_ACCOUNT_ID in .env.
* The seeds file itself never needs to change for account/region moves.

If AWS_ACCOUNT_ID or AWS_REGION are not set (e.g. in unit tests that only
import the lifecycle module), the ECR URIs fall back to the placeholder
string "ACCOUNT_ID_NOT_SET" so the import does not crash.
"""

import hashlib
import os

from apps.api.models.lab_flag import LabFlag
from apps.api.models.lab_template import LabTemplate

# ---------------------------------------------------------------------------
# Resolve account and region from config (or env directly as a fallback so
# this module can be imported in contexts where config.py would raise).
# ---------------------------------------------------------------------------
try:
    from apps.api.config import AWS_ACCOUNT_ID, AWS_REGION
except Exception:
    AWS_ACCOUNT_ID = os.getenv("AWS_ACCOUNT_ID", "")
    AWS_REGION = os.getenv("AWS_REGION", "eu-central-1")

_ACCOUNT = AWS_ACCOUNT_ID or "ACCOUNT_ID_NOT_SET"
_REGION = AWS_REGION or "eu-central-1"
_ECR_BASE = f"{_ACCOUNT}.dkr.ecr.{_REGION}.amazonaws.com"


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _flag_hash(plain: str) -> str:
    """SHA-256 hex digest of a plain-text flag.

    We NEVER store plain-text flags in the database.  The hash is compared
    against the student's submission at runtime.
    """
    return hashlib.sha256(plain.strip().encode()).hexdigest()


# ---------------------------------------------------------------------------
# Lab Templates
# ---------------------------------------------------------------------------
# Each template = one type of lab challenge.
# Lab runtime is disabled in this build. Template image and port metadata are
# retained for catalog display and the future runtime implementation.

LAB_TEMPLATES = [
    # 1. OWASP Juice Shop — pulled directly from Docker Hub (no build needed)
    LabTemplate(
        id="web-sqli-01",
        title="SQL Injection - Login Bypass",
        category="Web",
        difficulty="Beginner",
        description=(
            "Exploit a classic SQL injection vulnerability in the OWASP Juice Shop "
            "login form. Use SQL injection to bypass authentication and log in as the "
            "admin user without knowing the password. A flag is hidden in the admin account."
        ),
        credits_cost=1,
        ttl_hours=2,
        # Juice Shop is a public Docker Hub image — no ECR/build needed.
        docker_image_uri="bkimminich/juice-shop:latest",
        cdk_stack_class="runtime-disabled",
        instance_type="t3.small",
        challenge_port=3000,
        challenge_path="/",
        is_active=True,
    ),

    # 2. DVWA — pulled directly from Docker Hub
    LabTemplate(
        id="web-dvwa-01",
        title="DVWA - Vulnerable Web Application",
        category="Web",
        difficulty="Beginner",
        description=(
            "Practice common web exploitation techniques against a vulnerable web app "
            "over HTTP. The app runs on port 80 and exposes a classic challenge surface "
            "for SQL injection, XSS, file inclusion, and command injection."
        ),
        credits_cost=1,
        ttl_hours=2,
        docker_image_uri="vulnerables/web-dvwa",
        cdk_stack_class="runtime-disabled",
        instance_type="t3.small",
        challenge_port=80,
        challenge_path="/",
        is_active=True,
    ),

    # 3. NexBank SQLi Lab — custom lab, requires ECR push first.
    # Run `make push-sqli-lab` to build and push the Docker image before use.
    LabTemplate(
        id="web-nexbank-01",
        title="NexBank - Corporate Portal SQLi",
        category="Web",
        difficulty="Intermediate",
        description=(
            "Exploit SQL injection vulnerabilities in NexBank, a corporate banking portal. "
            "The login form is protected by a Web Application Firewall (WAF) that blocks "
            "common payloads. Bypass it using UNION-based injection to access the classified "
            "vault table and extract the flag. Hint: the vault table has 4 columns."
        ),
        credits_cost=2,
        ttl_hours=2,
        docker_image_uri=f"{_ECR_BASE}/orchestryx/sqli-lab:latest",
        cdk_stack_class="runtime-disabled",
        instance_type="t3.small",
        challenge_port=80,
        challenge_path="/",
        is_active=True,
    ),

    # 4. PHP Remote Code Execution
    LabTemplate(
        id="web-php-rce-01",
        title="PHP Remote Code Execution",
        category="Web",
        difficulty="Intermediate",
        description=(
            "Exploit a vulnerable PHP application that allows remote code execution. "
            "Upload and execute arbitrary PHP code to gain shell access and retrieve "
            "the hidden flag."
        ),
        credits_cost=2,
        ttl_hours=2,
        docker_image_uri=f"{_ECR_BASE}/orchestryx/php-rce-lab:latest",
        cdk_stack_class="runtime-disabled",
        instance_type="t3.small",
        challenge_port=80,
        challenge_path="/",
        is_active=True,
    ),

    # 5. Local File Inclusion
    LabTemplate(
        id="web-lfi-01",
        title="The Herald - Local File Inclusion",
        category="Web",
        difficulty="Intermediate",
        description=(
            "Exploit a double URL-decoding local file inclusion bug in a news portal. "
            "Leak Apache environment secrets, forge the admin token, and retrieve the flag."
        ),
        credits_cost=2,
        ttl_hours=2,
        docker_image_uri=f"{_ECR_BASE}/orchestryx/lfi-lab:latest",
        cdk_stack_class="runtime-disabled",
        instance_type="t3.small",
        challenge_port=80,
        challenge_path="/",
        is_active=True,
    ),
]


# ---------------------------------------------------------------------------
# Lab Flags
# ---------------------------------------------------------------------------
# Each entry maps a template_id to the SHA-256 hash of the correct flag.
# The plain-text flag only lives inside the lab VM (e.g. /root/flag.txt or
# in a database table).  It is NEVER stored in our database.
#
# When a student submits a flag via POST /labs/{id}/flag:
#   1. We hash their submission with SHA-256.
#   2. We compare it to the hash stored here.
#   3. If they match → flag is correct.

LAB_FLAGS = [
    LabFlag(
        template_id="web-sqli-01",
        flag_hash=_flag_hash("ORCHESTRYX{sql_injection_success}"),
    ),
    LabFlag(
        template_id="web-dvwa-01",
        flag_hash=_flag_hash("ORCHESTRYX{dvwa_exploited}"),
    ),
    LabFlag(
        template_id="web-nexbank-01",
        # The entrypoint.sh overrides this at runtime with the $FLAG env var,
        # so the actual flag will be ORCHESTRYX{<instance-uuid>} in production.
        flag_hash=_flag_hash("ORCHESTRYX{sql_injection_default}"),
    ),
    LabFlag(
        template_id="web-php-rce-01",
        flag_hash=_flag_hash("ORCHESTRYX{php_rce_pwned}"),
    ),
    LabFlag(
        template_id="web-lfi-01",
        # Future runtime may inject ORCHESTRYX{<instance-id>} as FLAG.
        flag_hash=_flag_hash("ORCHESTRYX{lfi_pwned}"),
    ),
]
