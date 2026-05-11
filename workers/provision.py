"""
Lab provisioning worker.

Ordering is critical for security:
  1. Generate VPN keypair (pure crypto — no AWS calls yet).
  2. Get WireGuard gateway instance ID.
  3. Create a per-lab EC2 security group with inbound rule for the user's VPN
     IP /32 on the challenge port only.
  4. Register the VPN peer on the WireGuard gateway (SSM, waited on).
  5. Launch the ECS Fargate task with the per-lab SG attached.
  6. Poll ECS until RUNNING (get private IP).
  7. Render the full WireGuard client config and store it in vpn_config_blob.
  8. Write VpnPeer + LabAccessRule rows for auditability.
  9. Mark lab READY.

If any step from 3 onwards fails:
  - credits are refunded via _mark_failed()
  - the per-lab SG is deleted if it was created
  - the VPN peer is NOT revoked here (gateway failure should not block failure
    recording); a separate cleanup pass or manual intervention handles it
"""

import json
import logging
import time

from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from apps.api.config import (
    DATABASE_URL,
    LAB_ECS_CLUSTER,
    LAB_PROVISION_TIMEOUT_SECONDS,
    LAB_VPN_CONFIG_INLINE,
    LAB_VPN_CONFIG_SECRET_ID,
)
from apps.api.models.credit_transaction import CreditTransaction
from apps.api.models.lab_access_rule import LabAccessRule
from apps.api.models.lab_instance import LabInstance
from apps.api.models.lab_template import LabTemplate
from apps.api.models.user import User
from apps.api.models.vpn_peer import VpnPeer
from apps.api.services.lab_lifecycle import (
    LAB_STATUS_FAILED,
    LAB_STATUS_PROVISIONING,
    LAB_STATUS_READY,
    LAB_STATUS_STARTING,
    set_lab_status,
)
from apps.api.services.lab_runtime_ecs import (
    LabRuntimeAwsError,
    LabRuntimeConfigError,
    apply_task_snapshot,
    create_per_lab_security_group,
    delete_per_lab_security_group,
    describe_task,
    register_lab_task_definition,
    run_lab_task,
)
from apps.api.services.vpn_gateway import (
    VpnGatewayError,
    VpnPeerConfig,
    generate_vpn_peer_config,
    get_gateway_instance_id,
    register_vpn_peer,
    render_vpn_config,
)
from workers.celery_app import PROVISION_QUEUE, celery_app

logger = logging.getLogger(__name__)

SYNC_DATABASE_URL = DATABASE_URL.replace("+asyncpg", "")
engine = create_engine(SYNC_DATABASE_URL, pool_pre_ping=True, pool_recycle=300)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def _refund_credits(
    session, instance: LabInstance, template: LabTemplate | None, user: User | None
) -> None:
    if template is None or user is None:
        return
    user.credits_balance += float(template.credits_cost)
    session.add(
        CreditTransaction(
            user_id=user.id,
            delta=float(template.credits_cost),
            reason=f"Refund: lab provisioning failed for {template.id} ({instance.id})",
        )
    )


def _mark_failed(
    *,
    instance_id: str,
    template_id: str,
    user_id: str,
    message: str,
    failure_reason: str,
    per_lab_sg_id: str | None = None,
) -> None:
    """Mark the lab FAILED and refund credits. Best-effort SG cleanup runs first."""
    if per_lab_sg_id:
        delete_per_lab_security_group(per_lab_sg_id)

    with SessionLocal() as session:
        instance = session.get(LabInstance, instance_id)
        if instance is None:
            logger.error("Lab instance %s not found while marking failure", instance_id)
            return
        template = session.get(LabTemplate, template_id)
        user = session.get(User, user_id)
        already_failed = instance.status == LAB_STATUS_FAILED
        set_lab_status(
            session,
            instance,
            status=LAB_STATUS_FAILED,
            message=message,
            progress=100,
            level="error",
            phase="ecs-failed",
            failure_reason=failure_reason,
        )
        if not already_failed:
            _refund_credits(session, instance, template, user)
        session.commit()


@celery_app.task(queue=PROVISION_QUEUE)
def provision_lab(instance_id: str, template_id: str, user_id: str) -> None:
    """Launch one lab as an isolated ECS Fargate task with per-lab network isolation."""
    logger.info("Starting ECS Fargate lab provisioning for %s", instance_id)

    # Tracks resources created mid-flight so _mark_failed can clean them up.
    per_lab_sg_id: str | None = None
    peer_config: VpnPeerConfig | None = None

    try:
        # ------------------------------------------------------------------ #
        # Phase 1: Register task definition                                    #
        # ------------------------------------------------------------------ #
        with SessionLocal() as session:
            instance = session.get(LabInstance, instance_id)
            template = session.get(LabTemplate, template_id)
            if instance is None or template is None:
                logger.error(
                    "Cannot provision lab %s: instance=%s template=%s",
                    instance_id,
                    bool(instance),
                    bool(template),
                )
                return

            set_lab_status(
                session,
                instance,
                status=LAB_STATUS_PROVISIONING,
                message="Preparing ECS Fargate task definition.",
                progress=20,
                phase="ecs-task-definition",
            )
            session.commit()

            task_definition_arn, container_name = register_lab_task_definition(template)
            instance.ecs_cluster_name = LAB_ECS_CLUSTER
            instance.ecs_task_definition_arn = task_definition_arn
            instance.ecs_container_name = container_name

            # Capture values we need outside the session scope.
            challenge_port: int = template.challenge_port
            template_expires_at = instance.expires_at

            set_lab_status(
                session,
                instance,
                status=LAB_STATUS_STARTING,
                message="Configuring VPN peer and per-lab network isolation.",
                progress=30,
                phase="vpn-setup",
            )
            session.commit()

        # ------------------------------------------------------------------ #
        # Phase 2: VPN peer keypair (pure crypto — no AWS)                    #
        # ------------------------------------------------------------------ #
        peer_config = generate_vpn_peer_config(instance_id)
        gateway_instance_id = get_gateway_instance_id()

        # ------------------------------------------------------------------ #
        # Phase 3: Create per-lab security group                              #
        # Inbound: tcp/{challenge_port} from {peer_config.client_ip}/32 only  #
        # ------------------------------------------------------------------ #
        per_lab_sg_id = create_per_lab_security_group(
            instance_id=instance_id,
            source_vpn_ip=peer_config.client_ip,
            challenge_port=challenge_port,
        )

        with SessionLocal() as session:
            instance = session.get(LabInstance, instance_id)
            if instance is None:
                logger.error("Lab instance %s disappeared before SG store", instance_id)
                return
            instance.ecs_security_group_id = per_lab_sg_id
            # Store non-sensitive peer info. private_key is intentionally absent.
            instance.secrets_key = json.dumps({
                "public_key": peer_config.public_key,
                "client_ip": peer_config.client_ip,
                "peer_added": False,
            })
            session.commit()

        # ------------------------------------------------------------------ #
        # Phase 4: Register VPN peer (SSM, waited on — fails hard)            #
        # ------------------------------------------------------------------ #
        register_vpn_peer(gateway_instance_id, peer_config)

        with SessionLocal() as session:
            instance = session.get(LabInstance, instance_id)
            if instance is None:
                return
            secrets = json.loads(instance.secrets_key or "{}")
            secrets["peer_added"] = True
            instance.secrets_key = json.dumps(secrets)
            set_lab_status(
                session,
                instance,
                status=LAB_STATUS_STARTING,
                message="Launching lab container on ECS Fargate.",
                progress=50,
                phase="ecs-run-task",
            )
            session.commit()

        # ------------------------------------------------------------------ #
        # Phase 5: Launch ECS task with the per-lab SG                        #
        # ------------------------------------------------------------------ #
        with SessionLocal() as session:
            instance = session.get(LabInstance, instance_id)
            template = session.get(LabTemplate, template_id)
            if instance is None or template is None:
                return

            task_arn = run_lab_task(
                instance=instance,
                template=template,
                task_definition_arn=task_definition_arn,
                per_lab_security_group_id=per_lab_sg_id,
            )
            instance.ecs_task_arn = task_arn
            session.commit()

        # ------------------------------------------------------------------ #
        # Phase 6: Poll ECS until RUNNING                                     #
        # ------------------------------------------------------------------ #
        deadline = time.monotonic() + LAB_PROVISION_TIMEOUT_SECONDS
        snapshot = None
        while time.monotonic() < deadline:
            snapshot = describe_task(task_arn)
            if snapshot is None:
                time.sleep(2)
                continue
            with SessionLocal() as session:
                instance = session.get(LabInstance, instance_id)
                if instance is None:
                    logger.error("Lab instance %s disappeared while polling ECS", instance_id)
                    return
                apply_task_snapshot(instance, snapshot)
                set_lab_status(
                    session,
                    instance,
                    status=LAB_STATUS_STARTING,
                    message=f"ECS task is {snapshot.last_status or 'starting'}.",
                    progress=70,
                    phase="ecs-poll",
                )
                session.commit()

            if snapshot.last_status == "RUNNING":
                break
            if snapshot.last_status == "STOPPED":
                raise LabRuntimeAwsError(
                    snapshot.stopped_reason or "ECS task stopped before becoming ready"
                )
            time.sleep(3)
        else:
            raise LabRuntimeAwsError("Timed out waiting for ECS task to reach RUNNING")

        # ------------------------------------------------------------------ #
        # Phase 7: Render VPN config + write VpnPeer / LabAccessRule          #
        # ------------------------------------------------------------------ #
        with SessionLocal() as session:
            instance = session.get(LabInstance, instance_id)
            if instance is None:
                logger.error("Lab instance %s disappeared before ready update", instance_id)
                return
            if snapshot is not None:
                apply_task_snapshot(instance, snapshot)

            lab_private_ip = instance.ecs_private_ip or ""

            # Render the full WireGuard client config now that we have the lab IP.
            # peer_config.private_key is used here and ONLY here — never written to DB.
            vpn_config = render_vpn_config(
                peer_config=peer_config,
                lab_private_ip=lab_private_ip,
                vpn_config_secret_id=LAB_VPN_CONFIG_SECRET_ID,
                vpn_config_inline=LAB_VPN_CONFIG_INLINE,
            )
            if vpn_config:
                instance.vpn_config_blob = vpn_config
            else:
                logger.warning(
                    "No VPN config template configured; /config will return 503 for lab %s",
                    instance_id,
                )

            # Audit records — public_key and client_ip only, never private_key.
            vpn_peer = VpnPeer(
                instance_id=instance_id,
                user_id=user_id,
                public_key=peer_config.public_key,
                assigned_vpn_ip=peer_config.client_ip,
                status="active",
            )
            session.add(vpn_peer)
            session.flush()  # populate vpn_peer.id

            # Update secrets_key to include the peer record ID for cross-reference.
            instance.secrets_key = json.dumps({
                "public_key": peer_config.public_key,
                "client_ip": peer_config.client_ip,
                "peer_added": True,
                "vpn_peer_id": vpn_peer.id,
            })

            access_rule = LabAccessRule(
                instance_id=instance_id,
                user_id=user_id,
                vpn_peer_id=vpn_peer.id,
                source_vpn_ip=peer_config.client_ip,
                destination_lab_ip=lab_private_ip or None,
                allowed_ports=[challenge_port],
                security_group_id=per_lab_sg_id,
                status="active",
                expires_at=template_expires_at,
            )
            session.add(access_rule)

            set_lab_status(
                session,
                instance,
                status=LAB_STATUS_READY,
                message="Lab is running. Download the VPN config to connect.",
                progress=100,
                phase="ecs-ready",
            )
            session.commit()

        logger.info("Lab %s is READY (task=%s, vpn_ip=%s)", instance_id, task_arn, peer_config.client_ip)

    except (LabRuntimeConfigError, LabRuntimeAwsError, VpnGatewayError) as exc:
        logger.exception("ECS lab provisioning failed for %s", instance_id)
        try:
            _mark_failed(
                instance_id=instance_id,
                template_id=template_id,
                user_id=user_id,
                message="Lab provisioning failed. Credits were refunded.",
                failure_reason=str(exc),
                per_lab_sg_id=per_lab_sg_id,
            )
        except SQLAlchemyError:
            logger.exception("Database compensation failed after ECS provisioning failure")
            raise
        raise
    except SQLAlchemyError as exc:
        logger.exception("Database write failed while provisioning ECS lab %s", instance_id)
        if per_lab_sg_id:
            delete_per_lab_security_group(per_lab_sg_id)
        raise RuntimeError("Could not update lab provisioning state") from exc
