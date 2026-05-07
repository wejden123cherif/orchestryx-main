from datetime import datetime, timezone

from sqlalchemy.orm import Session

from apps.api.models.lab_event import LabEvent
from apps.api.models.lab_instance import LabInstance


LAB_STATUS_QUEUED = "QUEUED"
LAB_STATUS_PROVISIONING = "PROVISIONING"
LAB_STATUS_STARTING = "STARTING"
LAB_STATUS_READY = "READY"
LAB_STATUS_FAILED = "FAILED"
LAB_STATUS_EXPIRED = "EXPIRED"
LAB_STATUS_STOPPED = "STOPPED"
LAB_STATUS_DESTROYING = "DESTROYING"

LEGACY_STATUS_MAP = {
    "RUNNING": LAB_STATUS_READY,
    "DESTROYED": LAB_STATUS_STOPPED,
}

ACTIVE_LAB_STATUSES = [
    LAB_STATUS_QUEUED,
    LAB_STATUS_PROVISIONING,
    LAB_STATUS_STARTING,
    LAB_STATUS_READY,
]

TERMINAL_LAB_STATUSES = [
    LAB_STATUS_FAILED,
    LAB_STATUS_EXPIRED,
    LAB_STATUS_STOPPED,
]

STOPPABLE_LAB_STATUSES = [
    LAB_STATUS_QUEUED,
    LAB_STATUS_PROVISIONING,
    LAB_STATUS_STARTING,
    LAB_STATUS_READY,
]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_lab_status(status: str | None) -> str:
    if not status:
        return LAB_STATUS_FAILED
    normalized = status.upper()
    return LEGACY_STATUS_MAP.get(normalized, normalized)


def set_lab_status(
    session: Session,
    instance: LabInstance,
    *,
    status: str,
    message: str,
    progress: int | None = None,
    level: str = "info",
    phase: str | None = None,
    failure_reason: str | None = None,
) -> None:
    now = utc_now()
    instance.status = status
    instance.status_message = message
    instance.last_status_at = now
    if progress is not None:
        instance.progress = max(0, min(100, progress))
    if failure_reason is not None:
        instance.failure_reason = failure_reason
    if status == LAB_STATUS_PROVISIONING and instance.provisioning_started_at is None:
        instance.provisioning_started_at = now
    if status == LAB_STATUS_READY:
        instance.ready_at = now
        instance.failure_reason = None

    session.add(
        LabEvent(
            instance_id=instance.id,
            level=level,
            phase=phase or status.lower(),
            message=message,
            progress=instance.progress,
        )
    )
