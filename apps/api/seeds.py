import hashlib

from apps.api.models.lab_template import LabTemplate
from apps.api.models.lab_flag import LabFlag


# ── Helper: hash a plain-text flag with SHA-256 ─────────────────────
# We NEVER store plain-text flags in the database.
# The hash is compared against the student's submission at runtime.
def _flag_hash(plain: str) -> str:
    return hashlib.sha256(plain.strip().encode()).hexdigest()


# ── Lab Templates ────────────────────────────────────────────────────
# Each template = one type of lab challenge.
# The provisioning worker reads docker_image_uri and challenge_port
# from here to know what to deploy on the EC2 instance.
LAB_TEMPLATES = [
    # 1. OWASP Juice Shop — pulled directly from Docker Hub (no build needed)
    LabTemplate(
        id="web-sqli-01",
        title="SQL Injection - Login Bypass",
        category="Web",
        difficulty="Beginner",
        description="Exploit a classic SQL injection vulnerability in the OWASP Juice Shop login form. "
                    "Use SQL injection to bypass authentication and log in as the admin user without "
                    "knowing the password. A flag is hidden in the admin account.",
        credits_cost=1,
        ttl_hours=2,
        # Juice Shop is a public Docker Hub image — no ECR/build needed
        docker_image_uri="bkimminich/juice-shop:latest",
        cdk_stack_class="JuiceShopLabStack",
        instance_type="t3.small",
        challenge_port=3000,  # Juice Shop serves on port 3000
        challenge_path="/",
        is_active=True,
    ),

    # 2. DVWA — pulled directly from Docker Hub
    LabTemplate(
        id="web-dvwa-01",
        title="DVWA - Vulnerable Web Application",
        category="Web",
        difficulty="Beginner",
        description="Practice common web exploitation techniques against a vulnerable web app over HTTP. "
                    "The app runs on port 80 and exposes a classic challenge surface for SQL injection, "
                    "XSS, file inclusion, and command injection.",
        credits_cost=1,
        ttl_hours=2,
        docker_image_uri="vulnerables/web-dvwa",
        cdk_stack_class="JuiceShopLabStack",
        instance_type="t3.small",
        challenge_port=80,
        challenge_path="/",
        is_active=True,
    ),

    # 3. NexBank SQLi Lab — custom lab, requires ECR push first
    # Run `make push-sqli-lab` to build and push the Docker image before using this.
    # This is the NexBank corporate banking portal with a vulnerable login form.
    # The student must bypass the WAF, use UNION-based injection to read the vault table.
    LabTemplate(
        id="web-nexbank-01",
        title="NexBank - Corporate Portal SQLi",
        category="Web",
        difficulty="Intermediate",
        description="Exploit SQL injection vulnerabilities in NexBank, a corporate banking portal. "
                    "The login form is protected by a Web Application Firewall (WAF) that blocks common "
                    "payloads. Bypass it using UNION-based injection to access the classified vault table "
                    "and extract the flag. Hint: the vault table has 4 columns.",
        credits_cost=2,
        ttl_hours=2,
        # ECR image — built from labs/sqli-lab/ and pushed via `make push-sqli-lab`
        docker_image_uri="254076817005.dkr.ecr.eu-central-1.amazonaws.com/orchestryx/sqli-lab:latest",
        cdk_stack_class="JuiceShopLabStack",
        instance_type="t3.small",
        challenge_port=80,  # Apache serves on port 80
        challenge_path="/",
        # Active in catalog — requires `make push-sqli-lab` before first use
        is_active=True,
    ),

    # 4. PHP Remote Code Execution
    LabTemplate(
        id="web-php-rce-01",
        title="PHP Remote Code Execution",
        category="Web",
        difficulty="Intermediate",
        description="Exploit a vulnerable PHP application that allows remote code execution. "
                    "Upload and execute arbitrary PHP code to gain shell access and retrieve the hidden flag.",
        credits_cost=2,
        ttl_hours=2,
        # ECR image built from labs/php-rce-lab/. This lab is intentionally
        # separate from NexBank so each challenge has its own Docker context.
        docker_image_uri="254076817005.dkr.ecr.eu-central-1.amazonaws.com/orchestryx/php-rce-lab:latest",
        cdk_stack_class="JuiceShopLabStack",
        instance_type="t3.small",
        # The PHP Apache image exposes port 80, so the CDK worker maps 80:80.
        challenge_port=80,
        challenge_path="/",
        # Active once `make push-php-rce-lab` has uploaded the image to ECR.
        is_active=True,
    ),

    # 5. Local File Inclusion
    LabTemplate(
        id="web-lfi-01",
        title="The Herald - Local File Inclusion",
        category="Web",
        difficulty="Intermediate",
        description="Exploit a double URL-decoding local file inclusion bug in a news portal. "
                    "Leak Apache environment secrets, forge the admin token, and retrieve the flag.",
        credits_cost=2,
        ttl_hours=2,
        # ECR image built from labs/lfi-lab/. This keeps the LFI challenge
        # isolated from SQLi and RCE lab files while using the same LabStack.
        docker_image_uri="254076817005.dkr.ecr.eu-central-1.amazonaws.com/orchestryx/lfi-lab:latest",
        cdk_stack_class="JuiceShopLabStack",
        instance_type="t3.small",
        # The LFI lab is Apache/PHP on port 80, so the generic CDK stack maps 80:80.
        challenge_port=80,
        challenge_path="/",
        # Active once `make push-lfi-lab` has uploaded the image to ECR.
        is_active=True,
    ),
]


# ── Lab Flags ────────────────────────────────────────────────────────
# Each entry maps a template_id to the SHA-256 hash of the correct flag.
# The plain-text flag only lives inside the lab VM (e.g. /root/flag.txt
# or in a database table). It is NEVER stored in our database.
#
# When a student submits a flag via POST /labs/{id}/flag:
#   1. We hash their submission with SHA-256
#   2. We compare it to the hash stored here
#   3. If they match → flag is correct
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
        # This is the flag inside the NexBank vault table.
        # The entrypoint.sh overrides it at runtime with the $FLAG env var,
        # so the actual flag will be ORCHESTRYX{<instance-uuid>} in production.
        flag_hash=_flag_hash("ORCHESTRYX{sql_injection_default}"),
    ),
    LabFlag(
        template_id="web-php-rce-01",
        flag_hash=_flag_hash("ORCHESTRYX{php_rce_pwned}"),
    ),
    LabFlag(
        template_id="web-lfi-01",
        # The worker injects ORCHESTRYX{<instance-id>} as FLAG at runtime, but
        # this static hash keeps the template aligned with the lab_flags model.
        flag_hash=_flag_hash("ORCHESTRYX{lfi_pwned}"),
    ),
]
