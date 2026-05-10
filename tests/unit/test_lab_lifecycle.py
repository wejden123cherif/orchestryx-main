import os
import asyncio

os.environ.setdefault("DATABASE_URL", "postgresql://user:pass@localhost:5432/orchestryx")
os.environ.setdefault("AWS_REGION", "eu-central-1")
os.environ.setdefault("COGNITO_USER_POOL_ID", "local")
os.environ.setdefault("COGNITO_APP_CLIENT_ID", "local")
os.environ.setdefault("SQS_PROVISION_URL", "https://sqs.eu-central-1.amazonaws.com/123/provision")
os.environ.setdefault("SQS_DESTROY_URL", "https://sqs.eu-central-1.amazonaws.com/123/destroy")

from apps.api.services.lab_lifecycle import (  # noqa: E402
    ACTIVE_LAB_STATUSES,
    LAB_STATUS_DESTROYING,
    LAB_STATUS_PROVISIONING,
    LAB_STATUS_QUEUED,
    LAB_STATUS_READY,
    LAB_STATUS_STARTING,
    LAB_STATUS_STOPPED,
    STOPPABLE_LAB_STATUSES,
    normalize_lab_status,
)
from fastapi import HTTPException  # noqa: E402
from apps.api.api.labs import StartLabRequest, LEGACY_ACTIVE_LAB_STATUSES, USER_VISIBLE_LAB_STATUSES, start_lab  # noqa: E402


def test_legacy_statuses_are_normalized_for_api_clients():
    assert normalize_lab_status("RUNNING") == LAB_STATUS_READY
    assert normalize_lab_status("DESTROYED") == LAB_STATUS_STOPPED
    assert normalize_lab_status("ready") == LAB_STATUS_READY


def test_startup_statuses_are_active_and_stoppable():
    assert LAB_STATUS_QUEUED in ACTIVE_LAB_STATUSES
    assert LAB_STATUS_PROVISIONING in ACTIVE_LAB_STATUSES
    assert LAB_STATUS_STARTING in ACTIVE_LAB_STATUSES
    assert LAB_STATUS_READY in ACTIVE_LAB_STATUSES

    assert LAB_STATUS_QUEUED in STOPPABLE_LAB_STATUSES
    assert LAB_STATUS_STARTING in STOPPABLE_LAB_STATUSES


def test_destroying_is_visible_but_not_counted_as_active():
    assert "DESTROYING" not in LEGACY_ACTIVE_LAB_STATUSES
    assert LAB_STATUS_DESTROYING in USER_VISIBLE_LAB_STATUSES


def test_start_lab_returns_controlled_501_when_runtime_disabled():
    async def call_start_lab():
        await start_lab(
            StartLabRequest(template_id="web-sqli-01"),
            user={"sub": "local-user"},
            db=None,
        )

    try:
        asyncio.run(call_start_lab())
    except HTTPException as exc:
        assert exc.status_code == 501
        assert "Lab runtime is disabled" in str(exc.detail)
    else:
        raise AssertionError("start_lab should reject requests while runtime is disabled")
