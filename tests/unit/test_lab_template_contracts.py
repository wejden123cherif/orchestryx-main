"""
Contract tests for lab template seed data.

These tests verify that:
1. All active templates have valid challenge URLs the CDK stack can serve.
2. ECR-backed labs have matching Dockerfiles and Makefile push targets.

The tests import seeds.py directly (rather than parsing its AST) so they
work correctly whether docker_image_uri values are plain string literals or
f-strings built from config variables.
"""

import os
import sys
from pathlib import Path

# ── Ensure the repo root is importable ───────────────────────────────────────
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Provide the minimum env vars that config.py requires so the import does not
# raise ConfigError in a test environment without a real .env file.
os.environ.setdefault("DATABASE_URL", "postgresql://user:pass@localhost:5432/orchestryx")
os.environ.setdefault("AWS_REGION", "eu-central-1")
os.environ.setdefault("AWS_ACCOUNT_ID", "123456789012")
os.environ.setdefault("COGNITO_USER_POOL_ID", "local")
os.environ.setdefault("COGNITO_APP_CLIENT_ID", "local")
os.environ.setdefault("SQS_PROVISION_URL", "https://sqs.eu-central-1.amazonaws.com/123/provision")
os.environ.setdefault("SQS_DESTROY_URL", "https://sqs.eu-central-1.amazonaws.com/123/destroy")

MAKEFILE_PATH = ROOT / "Makefile"


def _active_lab_templates() -> list[dict]:
    """Import seeds.py and return metadata for all active templates."""
    # Import at call time so the env vars set above are in place.
    from apps.api.seeds import LAB_TEMPLATES  # noqa: PLC0415

    return [
        {
            "id": t.id,
            "docker_image_uri": t.docker_image_uri,
            "challenge_port": t.challenge_port,
            "challenge_path": t.challenge_path,
            "is_active": t.is_active,
        }
        for t in LAB_TEMPLATES
        if t.is_active
    ]


def test_active_lab_templates_have_challenge_urls_the_stack_can_serve():
    templates = _active_lab_templates()

    assert {t["id"] for t in templates} == {
        "web-sqli-01",
        "web-dvwa-01",
        "web-nexbank-01",
        "web-php-rce-01",
        "web-lfi-01",
    }

    for template in templates:
        assert template["docker_image_uri"].strip(), (
            f"Template {template['id']} has an empty docker_image_uri"
        )
        assert 1 <= template["challenge_port"] <= 65535, (
            f"Template {template['id']} has an invalid challenge_port: {template['challenge_port']}"
        )
        assert template["challenge_path"].startswith("/"), (
            f"Template {template['id']} challenge_path must start with '/'"
        )


def test_ecr_backed_labs_have_matching_dockerfiles_and_push_targets():
    makefile = MAKEFILE_PATH.read_text(encoding="utf-8")

    expected_contexts = {
        "orchestryx/sqli-lab": ("labs/sqli-lab/Dockerfile", "push-sqli-lab"),
        "orchestryx/php-rce-lab": ("labs/php-rce-lab/Dockerfile", "push-php-rce-lab"),
        "orchestryx/lfi-lab": ("labs/lfi-lab/Dockerfile", "push-lfi-lab"),
    }

    for template in _active_lab_templates():
        image = template["docker_image_uri"]
        if ".dkr.ecr." not in image:
            # Docker Hub image — no Dockerfile or push target required.
            continue

        # Extract the repo path from the ECR URI:
        #   123456789012.dkr.ecr.eu-central-1.amazonaws.com/orchestryx/sqli-lab:latest
        #   → orchestryx/sqli-lab
        repo = image.split(".amazonaws.com/", 1)[1].rsplit(":", 1)[0]
        assert repo in expected_contexts, (
            f"Template {template['id']} uses ECR repo '{repo}' which has no "
            f"expected Dockerfile/push-target entry in the test."
        )

        dockerfile_path, make_target = expected_contexts[repo]
        dockerfile = (ROOT / dockerfile_path).read_text(encoding="utf-8")

        assert f"EXPOSE {template['challenge_port']}" in dockerfile, (
            f"Dockerfile {dockerfile_path} does not EXPOSE port {template['challenge_port']} "
            f"as required by template {template['id']}"
        )
        assert f"{make_target}:" in makefile, (
            f"Makefile is missing target '{make_target}:' for template {template['id']}"
        )

    assert "push-custom-labs: push-sqli-lab push-php-rce-lab push-lfi-lab" in makefile
