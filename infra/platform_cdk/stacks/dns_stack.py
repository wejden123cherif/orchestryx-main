from __future__ import annotations

import aws_cdk as cdk
from aws_cdk import aws_ec2 as ec2
from constructs import Construct

from private_dns import PrivateDnsZone


class DnsStack(cdk.Stack):
    """Private DNS foundation for future internal platform service names."""

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        config: dict,
        env_name: str,
        vpc: ec2.IVpc,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        dns = config.get("dns", {})
        zone_name = dns.get("private_zone_name", f"{env_name}.orchestryx.internal")

        self.private_hosted_zone = PrivateDnsZone(
            self,
            "PrivateDns",
            vpc=vpc,
            zone_name=zone_name,
        ).zone

        cdk.CfnOutput(
            self,
            "PrivateHostedZoneId",
            value=self.private_hosted_zone.hosted_zone_id,
        )
        cdk.CfnOutput(self, "PrivateHostedZoneName", value=zone_name)
