from __future__ import annotations

import aws_cdk as cdk
from aws_cdk import aws_ec2 as ec2
from aws_cdk import aws_route53 as route53
from constructs import Construct

from wireguard_gateway import WireGuardGateway

_VPN_CLIENT_CIDR = "10.8.0.0/16"


class VpnStack(cdk.Stack):
    """Shared WireGuard gateway operating in routed (non-NAT) mode.

    Route table entries are added to all private subnets so that VPC-internal
    lab containers can send response packets back to VPN clients via the gateway.
    Source/destination check is disabled on the gateway instance so it can
    forward these packets.

    The gateway does NOT MASQUERADE traffic destined for the VPC, so the
    source VPN IP is preserved end-to-end. Per-lab EC2 security groups rely
    on this to enforce source_vpn_ip/32 -> challenge_port rules.
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
        network = config.get("network", {})
        prefix = config.get("naming", {}).get("resource_prefix", f"orchestryx-{env_name}")
        vpc_cidr = network.get("cidr", "10.80.0.0/16")

        gateway = WireGuardGateway(
            self,
            "WireGuardGateway",
            vpc=vpc,
            resource_prefix=prefix,
            instance_type=vpn.get("instance_type", "t3.micro"),
            enabled=bool(vpn.get("enabled", False)),
            vpc_cidr=vpc_cidr,
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

            # Add a route in every private subnet: 10.8.0.0/16 -> WireGuard instance.
            # This allows lab ECS tasks (in private subnets) to respond to VPN clients
            # without each response leaving via the NAT gateway or being dropped.
            for i, subnet in enumerate(vpc.private_subnets):
                ec2.CfnRoute(
                    self,
                    f"VpnClientRoute{i}",
                    route_table_id=subnet.route_table.route_table_id,
                    destination_cidr_block=_VPN_CLIENT_CIDR,
                    instance_id=gateway.instance.instance_id,
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
        if gateway.instance is not None:
            cdk.CfnOutput(
                self,
                "WireGuardInstanceId",
                value=gateway.instance.instance_id,
                description="Instance ID of the WireGuard gateway for SSM scoping",
            )

