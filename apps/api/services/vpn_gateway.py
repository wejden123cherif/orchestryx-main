"""
WireGuard gateway operations.

All AWS calls that touch the WireGuard EC2 gateway live here so they can be
tested and replaced independently of the ECS provisioning logic.

Design constraints enforced by this module
------------------------------------------
- The client private key is generated here and returned in VpnPeerConfig.
- It is the caller's responsibility to use the private key (e.g. to render a
  WireGuard config) and NOT persist it to the database.
- Only public_key and client_ip should be written to persistent storage.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import time
from dataclasses import dataclass

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey

from apps.api.config import AWS_REGION

logger = logging.getLogger(__name__)

_GATEWAY_TAG_FILTER = "*WireGuardGateway/Instance*"
_SSM_POLL_INTERVAL_SECONDS = 2
_SSM_COMMAND_TIMEOUT_SECONDS = 30


class VpnGatewayError(RuntimeError):
    """Raised when a WireGuard gateway operation fails."""


@dataclass(frozen=True)
class VpnPeerConfig:
    """
    Ephemeral keypair + assigned VPN IP for one lab session.

    IMPORTANT: private_key must NOT be written to the database.
    Store it only in vpn_config_blob (rendered WireGuard config) on the
    LabInstance row, and only for the purpose of one-time client download.
    """

    public_key: str
    client_ip: str
    private_key: str  # ephemeral — never persisted directly


def _ssm_client():
    return boto3.client("ssm", region_name=AWS_REGION)


def _ec2_client():
    return boto3.client("ec2", region_name=AWS_REGION)


def _secrets_client():
    return boto3.client("secretsmanager", region_name=AWS_REGION)


def get_gateway_instance_id() -> str:
    """Return the instance ID of the running WireGuard gateway EC2 instance.

    Discovers by tag Name matching *WireGuardGateway/Instance*.
    Raises VpnGatewayError if no running instance is found.
    """
    try:
        response = _ec2_client().describe_instances(
            Filters=[
                {"Name": "tag:Name", "Values": [_GATEWAY_TAG_FILTER]},
                {"Name": "instance-state-name", "Values": ["running"]},
            ]
        )
    except (BotoCoreError, ClientError) as exc:
        raise VpnGatewayError("Could not query EC2 for WireGuard gateway instance") from exc

    reservations = response.get("Reservations", [])
    if not reservations:
        raise VpnGatewayError(
            "No running WireGuard Gateway EC2 instance found. "
            "Ensure an instance tagged Name='*WireGuardGateway/Instance*' is running."
        )
    instances = reservations[0]["Instances"]
    if len(instances) > 1:
        logger.warning(
            "Multiple WireGuard gateway instances matched; using %s",
            instances[0]["InstanceId"],
        )
    return instances[0]["InstanceId"]


def _run_ssm_command(
    gateway_instance_id: str,
    command: str,
    timeout_seconds: int = _SSM_COMMAND_TIMEOUT_SECONDS,
) -> None:
    """Dispatch a shell command to the WireGuard gateway via SSM and block until done.

    Raises VpnGatewayError on command failure, AWS error, or timeout.
    This replaces the original fire-and-forget send_command pattern.
    """
    try:
        response = _ssm_client().send_command(
            InstanceIds=[gateway_instance_id],
            DocumentName="AWS-RunShellScript",
            Parameters={"commands": [command]},
        )
    except (BotoCoreError, ClientError) as exc:
        raise VpnGatewayError(
            f"Could not dispatch SSM command to gateway {gateway_instance_id}"
        ) from exc

    command_id = response["Command"]["CommandId"]
    deadline = time.monotonic() + timeout_seconds

    while time.monotonic() < deadline:
        time.sleep(_SSM_POLL_INTERVAL_SECONDS)
        try:
            inv = _ssm_client().get_command_invocation(
                CommandId=command_id,
                InstanceId=gateway_instance_id,
            )
        except (BotoCoreError, ClientError) as exc:
            raise VpnGatewayError(
                f"Could not poll SSM command invocation {command_id}"
            ) from exc

        status = inv.get("Status", "")
        if status == "Success":
            return
        if status in (
            "Failed",
            "Cancelled",
            "TimedOut",
            "Undeliverable",
            "DeliveryTimedOut",
        ):
            stderr = (inv.get("StandardErrorContent") or "").strip()
            raise VpnGatewayError(
                f"SSM command on {gateway_instance_id} failed "
                f"(status={status}): {stderr or '(no stderr)'}"
            )
        # InProgress / Pending / Delayed — keep polling

    raise VpnGatewayError(
        f"SSM command timed out after {timeout_seconds}s "
        f"(instance={gateway_instance_id}, command_id={command_id})"
    )


def generate_vpn_peer_config(instance_id: str) -> VpnPeerConfig:
    """Generate a WireGuard X25519 keypair and assign a deterministic VPN IP.

    The IP is derived from SHA-256(instance_id) so it is unique per lab
    without requiring a separate allocation table.
    No AWS calls are made.
    """
    private_key_obj = X25519PrivateKey.generate()
    private_bytes = private_key_obj.private_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_bytes = private_key_obj.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    client_priv_b64 = base64.b64encode(private_bytes).decode("ascii")
    client_pub_b64 = base64.b64encode(public_bytes).decode("ascii")

    h = hashlib.sha256(instance_id.encode()).digest()
    oct3 = int(h[0])
    oct4 = (int(h[1]) % 253) + 2
    client_ip = f"10.8.{oct3}.{oct4}"

    return VpnPeerConfig(
        public_key=client_pub_b64,
        client_ip=client_ip,
        private_key=client_priv_b64,
    )


def register_vpn_peer(gateway_instance_id: str, peer_config: VpnPeerConfig) -> None:
    """Register a WireGuard peer on the gateway and flush config to disk.

    Both the `wg set` and `wg-quick save` commands are waited on via SSM.
    If either fails, VpnGatewayError is raised and the lab provisioning path
    will treat it as a hard failure with credit refund.
    """
    add_cmd = (
        f"wg set wg0 peer {peer_config.public_key} "
        f"allowed-ips {peer_config.client_ip}/32"
    )
    _run_ssm_command(gateway_instance_id, add_cmd)
    # Persist peer list to disk so it survives gateway reboots.
    _run_ssm_command(gateway_instance_id, "wg-quick save wg0")
    logger.info("Registered VPN peer %s on gateway %s", peer_config.client_ip, gateway_instance_id)


def revoke_vpn_peer(gateway_instance_id: str, public_key: str) -> None:
    """Remove a WireGuard peer from the gateway and flush config to disk.

    Logs and swallows errors rather than raising, so that lab destroy is not
    blocked by a transient gateway issue. Missing peers are silently ignored.
    """
    try:
        _run_ssm_command(gateway_instance_id, f"wg set wg0 peer {public_key} remove")
        _run_ssm_command(gateway_instance_id, "wg-quick save wg0")
        logger.info("Revoked VPN peer on gateway %s", gateway_instance_id)
    except VpnGatewayError:
        logger.exception(
            "Failed to revoke VPN peer on gateway %s; continuing with lab destroy",
            gateway_instance_id,
        )


def render_vpn_config(
    peer_config: VpnPeerConfig,
    lab_private_ip: str,
    vpn_config_secret_id: str = "",
    vpn_config_inline: str = "",
) -> str:
    """Render a complete WireGuard client .conf from a template.

    Template placeholders: {client_private_key}, {client_ip}, {lab_private_ip}.

    The template MUST use AllowedIPs = {lab_private_ip}/32 (not the VPC CIDR)
    so that each client only routes traffic to their own lab, not to all labs.

    Returns an empty string if no template is configured — the caller should
    log a warning and proceed; /config will return 503 for those labs.
    """
    template = vpn_config_inline or ""
    if not template and vpn_config_secret_id:
        try:
            secret = _secrets_client().get_secret_value(SecretId=vpn_config_secret_id)
            template = secret.get("SecretString", "")
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code == "ResourceNotFoundException":
                logger.warning(
                    "VPN config secret %r not found; /config will return 503 for this lab",
                    vpn_config_secret_id,
                )
                return ""
            raise VpnGatewayError(
                "Could not load VPN config template from Secrets Manager"
            ) from exc
        except BotoCoreError as exc:
            raise VpnGatewayError(
                "Could not load VPN config template from Secrets Manager"
            ) from exc

    if not template:
        return ""

    rendered = (
        template
        .replace("{client_private_key}", peer_config.private_key)
        .replace("{client_ip}", peer_config.client_ip)
        .replace("{lab_private_ip}", lab_private_ip)
    )
    return rendered
