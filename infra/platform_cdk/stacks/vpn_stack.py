from __future__ import annotations

import aws_cdk as cdk
from aws_cdk import aws_ec2 as ec2
from aws_cdk import aws_route53 as route53
from constructs import Construct

from wireguard_gateway import WireGuardGateway


class VpnStack(cdk.Stack):
    """Shared WireGuard gateway foundation.

    This is intentionally disabled by default while per-lab WireGuard behavior
    remains owned by the existing lab CDK app.
    """

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        config: dict,
        env_name: str,
        vpc: ec2.IVpc,
        private_hosted_zone: route53.IPrivateHostedZone,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        vpn = config.get("vpn", {})
        prefix = config.get("naming", {}).get("resource_prefix", f"orchestryx-{env_name}")

        gateway = WireGuardGateway(
            self,
            "WireGuardGateway",
            vpc=vpc,
            resource_prefix=prefix,
            instance_type=vpn.get("instance_type", "t3.micro"),
            enabled=bool(vpn.get("enabled", False)),
        )
        self.gateway_security_group = gateway.security_group

        if gateway.instance is not None:
            route53.ARecord(
                self,
                "WireGuardRecord",
                zone=private_hosted_zone,
                record_name=vpn.get("private_dns_name", "vpn"),
                target=route53.RecordTarget.from_ip_addresses(
                    gateway.instance.instance_private_ip
                ),
            )

        cdk.CfnOutput(
            self,
            "WireGuardSecurityGroupId",
            value=gateway.security_group.security_group_id,
        )
        cdk.CfnOutput(
            self,
            "WireGuardPrivateDnsName",
            value=vpn.get("private_dns_name", "vpn"),
        )

