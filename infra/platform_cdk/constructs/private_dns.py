from __future__ import annotations

from aws_cdk import aws_ec2 as ec2
from aws_cdk import aws_route53 as route53
from constructs import Construct


class PrivateDnsZone(Construct):
    """Private Route 53 zone for platform-internal service names."""

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        vpc: ec2.IVpc,
        zone_name: str,
    ) -> None:
        super().__init__(scope, construct_id)

        self.zone = route53.PrivateHostedZone(
            self,
            "Zone",
            zone_name=zone_name,
            vpc=vpc,
        )

