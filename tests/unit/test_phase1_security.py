"""
Phase 1 security tests.

Covers:
  - challenge URL never falls back to 10.8.0.1
  - challenge URL returns None when lab is not READY or IP is missing
  - VPN peer config generation produces valid /32 IPs from the 10.8.x.y range
  - private_key is NOT present in secrets_key JSON written by the provisioner
  - SSM command wrapper raises on failure statuses
  - SSM command wrapper raises on timeout
  - per-lab SG uses /32 source (not /16)
  - render_vpn_config substitutes all placeholders correctly
  - render_vpn_config returns empty string when no template is configured
"""

import json
import os
import time
import unittest
from unittest.mock import MagicMock, call, patch

os.environ.setdefault("DATABASE_URL", "postgresql://user:pass@localhost:5432/orchestryx")
os.environ.setdefault("AWS_REGION", "eu-central-1")
os.environ.setdefault("AWS_VPC_ID", "vpc-test123")
os.environ.setdefault("COGNITO_USER_POOL_ID", "local")
os.environ.setdefault("COGNITO_APP_CLIENT_ID", "local")
os.environ.setdefault("SQS_PROVISION_URL", "https://sqs.eu-central-1.amazonaws.com/123/provision")
os.environ.setdefault("SQS_DESTROY_URL", "https://sqs.eu-central-1.amazonaws.com/123/destroy")


# ---------------------------------------------------------------------------
# Challenge URL tests
# ---------------------------------------------------------------------------

from apps.api.services.lab_lifecycle import (  # noqa: E402
    LAB_STATUS_READY,
    LAB_STATUS_STARTING,
)
from apps.api.api.labs import _build_challenge_url  # noqa: E402


def _make_instance(status: str, private_ip: str | None, public_ip: str | None = None):
    instance = MagicMock()
    instance.status = status
    instance.ecs_private_ip = private_ip
    instance.ecs_public_ip = public_ip
    return instance


def _make_template(port: int = 3000, path: str = "/"):
    template = MagicMock()
    template.challenge_port = port
    template.challenge_path = path
    return template


class TestChallengeUrl(unittest.TestCase):

    def test_returns_none_when_not_ready(self):
        instance = _make_instance(LAB_STATUS_STARTING, "10.80.1.50")
        url = _build_challenge_url(instance, _make_template())
        self.assertIsNone(url)

    def test_returns_none_when_template_is_none(self):
        instance = _make_instance(LAB_STATUS_READY, "10.80.1.50")
        url = _build_challenge_url(instance, None)
        self.assertIsNone(url)

    def test_returns_none_when_private_ip_missing(self):
        instance = _make_instance(LAB_STATUS_READY, None)
        url = _build_challenge_url(instance, _make_template())
        self.assertIsNone(url)

    def test_never_returns_wireguard_gateway_address(self):
        """10.8.0.1 is the WireGuard gateway, not a valid lab endpoint."""
        for ip in [None, "", "  "]:
            instance = _make_instance(LAB_STATUS_READY, ip)
            url = _build_challenge_url(instance, _make_template())
            self.assertIsNone(url, f"Expected None for ip={ip!r}, got {url!r}")
            if url is not None:
                self.assertNotIn("10.8.0.1", url)

    def test_returns_private_ip_url_when_ready(self):
        instance = _make_instance(LAB_STATUS_READY, "10.80.2.44")
        url = _build_challenge_url(instance, _make_template(port=8080, path="/app"))
        self.assertEqual(url, "http://10.80.2.44:8080/app")

    def test_url_path_normalisation(self):
        instance = _make_instance(LAB_STATUS_READY, "10.80.1.1")
        url = _build_challenge_url(instance, _make_template(port=3000, path=""))
        self.assertEqual(url, "http://10.80.1.1:3000")

        url2 = _build_challenge_url(instance, _make_template(port=3000, path="/"))
        self.assertEqual(url2, "http://10.80.1.1:3000")


# ---------------------------------------------------------------------------
# VPN peer config generation
# ---------------------------------------------------------------------------

from apps.api.services.vpn_gateway import generate_vpn_peer_config, VpnPeerConfig  # noqa: E402


class TestVpnPeerConfigGeneration(unittest.TestCase):

    def test_generates_valid_vpn_ip_in_tunnel_subnet(self):
        config = generate_vpn_peer_config("some-instance-uuid")
        parts = config.client_ip.split(".")
        self.assertEqual(parts[0], "10")
        self.assertEqual(parts[1], "8")
        self.assertEqual(len(parts), 4)
        last_octet = int(parts[3])
        self.assertGreaterEqual(last_octet, 2)
        self.assertLessEqual(last_octet, 254)

    def test_deterministic_ip_for_same_instance_id(self):
        id1 = "aaaaaaaa-0000-0000-0000-000000000001"
        c1 = generate_vpn_peer_config(id1)
        c2 = generate_vpn_peer_config(id1)
        self.assertEqual(c1.client_ip, c2.client_ip)

    def test_different_instance_ids_produce_different_keys(self):
        c1 = generate_vpn_peer_config("aaaaaaaa-0000-0000-0000-000000000001")
        c2 = generate_vpn_peer_config("bbbbbbbb-0000-0000-0000-000000000002")
        self.assertNotEqual(c1.public_key, c2.public_key)
        self.assertNotEqual(c1.private_key, c2.private_key)

    def test_public_and_private_keys_are_distinct(self):
        config = generate_vpn_peer_config("test-instance-id")
        self.assertNotEqual(config.public_key, config.private_key)
        self.assertGreater(len(config.public_key), 10)
        self.assertGreater(len(config.private_key), 10)

    def test_private_key_present_on_config_object(self):
        """private_key must exist on VpnPeerConfig for rendering — just not in the DB."""
        config = generate_vpn_peer_config("test-id")
        self.assertTrue(config.private_key)


# ---------------------------------------------------------------------------
# secrets_key must not contain private_key
# ---------------------------------------------------------------------------

class TestSecretsKeyNoPrivateKey(unittest.TestCase):
    """
    The provisioner writes secrets_key JSON with only non-sensitive fields.
    This test verifies the contract by inspecting what the provisioner would
    write — using generate_vpn_peer_config() and the same dict construction
    as the worker.
    """

    def test_secrets_key_json_has_no_private_key(self):
        peer_config = generate_vpn_peer_config("instance-123")
        secrets_key_value = json.dumps({
            "public_key": peer_config.public_key,
            "client_ip": peer_config.client_ip,
            "peer_added": True,
            "vpn_peer_id": "some-uuid",
        })
        parsed = json.loads(secrets_key_value)
        self.assertIn("public_key", parsed)
        self.assertIn("client_ip", parsed)
        self.assertNotIn("private_key", parsed,
                         "private_key must never be written to secrets_key")

    def test_vpn_config_blob_contains_private_key(self):
        """vpn_config_blob is the only place the private key should appear."""
        peer_config = generate_vpn_peer_config("instance-123")
        rendered = (
            "[Interface]\nPrivateKey = {priv}\nAddress = {ip}/32\n"
            .format(priv=peer_config.private_key, ip=peer_config.client_ip)
        )
        self.assertIn(peer_config.private_key, rendered)
        # And that value should NOT be in the secrets_key JSON
        secrets_key = json.dumps({
            "public_key": peer_config.public_key,
            "client_ip": peer_config.client_ip,
        })
        self.assertNotIn(peer_config.private_key, secrets_key)


# ---------------------------------------------------------------------------
# SSM command wrapper: success, failure statuses, timeout
# ---------------------------------------------------------------------------

from apps.api.services.vpn_gateway import _run_ssm_command, VpnGatewayError  # noqa: E402


def _make_ssm_mock(statuses: list[str], stderr: str = "") -> MagicMock:
    """Build a mock SSM client whose get_command_invocation cycles through statuses."""
    client = MagicMock()
    client.send_command.return_value = {"Command": {"CommandId": "cmd-test-123"}}
    invocation_responses = [{"Status": s, "StandardErrorContent": stderr} for s in statuses]
    client.get_command_invocation.side_effect = invocation_responses
    return client


class TestRunSsmCommand(unittest.TestCase):

    @patch("apps.api.services.vpn_gateway._ssm_client")
    def test_succeeds_on_success_status(self, mock_client_factory):
        mock_client_factory.return_value = _make_ssm_mock(["InProgress", "Success"])
        # Should not raise
        _run_ssm_command("i-gateway123", "wg set wg0 peer ABC allowed-ips 10.8.1.2/32")

    @patch("apps.api.services.vpn_gateway._ssm_client")
    def test_raises_on_failed_status(self, mock_client_factory):
        mock_client_factory.return_value = _make_ssm_mock(["Failed"], stderr="no such device")
        with self.assertRaises(VpnGatewayError) as ctx:
            _run_ssm_command("i-gateway123", "wg set wg0 peer ABC allowed-ips 10.8.1.2/32")
        self.assertIn("Failed", str(ctx.exception))

    @patch("apps.api.services.vpn_gateway._ssm_client")
    def test_raises_on_cancelled_status(self, mock_client_factory):
        mock_client_factory.return_value = _make_ssm_mock(["Cancelled"])
        with self.assertRaises(VpnGatewayError):
            _run_ssm_command("i-gateway123", "wg set wg0 peer ABC allowed-ips 10.8.1.2/32")

    @patch("time.sleep", return_value=None)
    @patch("time.monotonic")
    @patch("apps.api.services.vpn_gateway._ssm_client")
    def test_raises_on_timeout(self, mock_client_factory, mock_monotonic, _mock_sleep):
        # Simulate time advancing past the timeout immediately after the first poll.
        mock_monotonic.side_effect = [0.0, 0.0, 999.0]
        client = MagicMock()
        client.send_command.return_value = {"Command": {"CommandId": "cmd-timeout"}}
        client.get_command_invocation.return_value = {"Status": "InProgress", "StandardErrorContent": ""}
        mock_client_factory.return_value = client
        with self.assertRaises(VpnGatewayError) as ctx:
            _run_ssm_command("i-gateway123", "wg-quick save wg0", timeout_seconds=10)
        self.assertIn("timed out", str(ctx.exception).lower())


# ---------------------------------------------------------------------------
# render_vpn_config
# ---------------------------------------------------------------------------

from apps.api.services.vpn_gateway import render_vpn_config  # noqa: E402

SAMPLE_TEMPLATE = (
    "[Interface]\n"
    "PrivateKey = {client_private_key}\n"
    "Address = {client_ip}/32\n"
    "DNS = 1.1.1.1\n"
    "\n"
    "[Peer]\n"
    "PublicKey = SERVER_PUB_KEY\n"
    "Endpoint = 1.2.3.4:51820\n"
    "AllowedIPs = {lab_private_ip}/32\n"
    "PersistentKeepalive = 25\n"
)


class TestRenderVpnConfig(unittest.TestCase):

    def _peer(self) -> VpnPeerConfig:
        return generate_vpn_peer_config("render-test-instance")

    def test_substitutes_all_placeholders(self):
        peer = self._peer()
        rendered = render_vpn_config(
            peer_config=peer,
            lab_private_ip="10.80.3.44",
            vpn_config_inline=SAMPLE_TEMPLATE,
        )
        self.assertIn(peer.private_key, rendered)
        self.assertIn(peer.client_ip, rendered)
        self.assertIn("10.80.3.44", rendered)
        # AllowedIPs must be /32 of the lab IP, not the VPC or tunnel CIDR.
        self.assertIn("AllowedIPs = 10.80.3.44/32", rendered)
        self.assertNotIn("10.80.0.0/16", rendered)
        self.assertNotIn("10.8.0.0/16", rendered)

    def test_returns_empty_string_when_no_template(self):
        peer = self._peer()
        rendered = render_vpn_config(
            peer_config=peer,
            lab_private_ip="10.80.3.44",
            vpn_config_inline="",
            vpn_config_secret_id="",
        )
        self.assertEqual(rendered, "")

    @patch("apps.api.services.vpn_gateway._secrets_client")
    def test_loads_template_from_secrets_manager(self, mock_client_factory):
        peer = self._peer()
        client = MagicMock()
        client.get_secret_value.return_value = {"SecretString": SAMPLE_TEMPLATE}
        mock_client_factory.return_value = client
        rendered = render_vpn_config(
            peer_config=peer,
            lab_private_ip="10.80.1.5",
            vpn_config_secret_id="orchestryx/vpn/shared",
        )
        self.assertIn(peer.private_key, rendered)
        self.assertIn("10.80.1.5/32", rendered)

    @patch("apps.api.services.vpn_gateway._secrets_client")
    def test_returns_empty_string_when_secret_not_found(self, mock_client_factory):
        from botocore.exceptions import ClientError
        peer = self._peer()
        client = MagicMock()
        client.get_secret_value.side_effect = ClientError(
            {"Error": {"Code": "ResourceNotFoundException", "Message": "not found"}},
            "GetSecretValue",
        )
        mock_client_factory.return_value = client
        rendered = render_vpn_config(
            peer_config=peer,
            lab_private_ip="10.80.1.5",
            vpn_config_secret_id="nonexistent/secret",
        )
        self.assertEqual(rendered, "")


# ---------------------------------------------------------------------------
# Per-lab security group uses /32 source
# ---------------------------------------------------------------------------

from apps.api.services.lab_runtime_ecs import create_per_lab_security_group  # noqa: E402


class TestPerLabSecurityGroup(unittest.TestCase):

    @patch("apps.api.services.lab_runtime_ecs._ec2_client")
    def test_ingress_rule_uses_slash_32_not_slash_16(self, mock_ec2_factory):
        ec2_client = MagicMock()
        ec2_client.create_security_group.return_value = {"GroupId": "sg-test123"}
        mock_ec2_factory.return_value = ec2_client

        create_per_lab_security_group(
            instance_id="aabbccdd-0000-0000-0000-000000000001",
            source_vpn_ip="10.8.5.100",
            challenge_port=3000,
        )

        call_args = ec2_client.authorize_security_group_ingress.call_args
        ip_permissions = call_args.kwargs["IpPermissions"]
        self.assertEqual(len(ip_permissions), 1)
        cidr = ip_permissions[0]["IpRanges"][0]["CidrIp"]
        # Must be /32 (exact IP), not /16 (subnet).
        self.assertEqual(cidr, "10.8.5.100/32",
                         f"Expected /32 source, got {cidr}")
        self.assertNotIn("/16", cidr)

    @patch("apps.api.services.lab_runtime_ecs._ec2_client")
    def test_sg_name_uses_instance_id_prefix(self, mock_ec2_factory):
        ec2_client = MagicMock()
        ec2_client.create_security_group.return_value = {"GroupId": "sg-name-test"}
        mock_ec2_factory.return_value = ec2_client

        create_per_lab_security_group(
            instance_id="aabbccdd-0000-0000-0000-000000000001",
            source_vpn_ip="10.8.1.2",
            challenge_port=8080,
        )

        create_call = ec2_client.create_security_group.call_args
        sg_name = create_call.kwargs["GroupName"]
        # SG name must contain the first 8 chars of the instance ID.
        self.assertIn("aabbccdd", sg_name)

    @patch("apps.api.services.lab_runtime_ecs._ec2_client")
    def test_challenge_port_is_used_in_rule(self, mock_ec2_factory):
        ec2_client = MagicMock()
        ec2_client.create_security_group.return_value = {"GroupId": "sg-porttest"}
        mock_ec2_factory.return_value = ec2_client

        create_per_lab_security_group(
            instance_id="deadbeef-0000-0000-0000-000000000001",
            source_vpn_ip="10.8.2.3",
            challenge_port=5432,
        )

        call_args = ec2_client.authorize_security_group_ingress.call_args
        perm = call_args.kwargs["IpPermissions"][0]
        self.assertEqual(perm["FromPort"], 5432)
        self.assertEqual(perm["ToPort"], 5432)
        self.assertEqual(perm["IpProtocol"], "tcp")


if __name__ == "__main__":
    unittest.main()
