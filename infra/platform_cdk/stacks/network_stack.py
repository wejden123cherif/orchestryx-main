from __future__ import annotations

import aws_cdk as cdk
from aws_cdk import aws_ec2 as ec2
from constructs import Construct


class NetworkStack(cdk.Stack):
    """Long-lived VPC foundation for API, workers, database, VPN, and labs."""

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        config: dict,
        env_name: str,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        network = config.get("network", {})
        prefix = config.get("naming", {}).get("resource_prefix", f"orchestryx-{env_name}")

        self.vpc = ec2.Vpc(
            self,
            "Vpc",
            vpc_name=f"{prefix}-vpc",
            ip_addresses=ec2.IpAddresses.cidr(network.get("cidr", "10.80.0.0/16")),
            max_azs=int(network.get("max_azs", 2)),
            nat_gateways=int(network.get("nat_gateways", 1)),
            subnet_configuration=[
                ec2.SubnetConfiguration(
                    name="public",
                    subnet_type=ec2.SubnetType.PUBLIC,
                    cidr_mask=24,
                ),
                ec2.SubnetConfiguration(
                    name="private",
                    subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS,
                    cidr_mask=24,
                ),
                ec2.SubnetConfiguration(
                    name="isolated",
                    subnet_type=ec2.SubnetType.PRIVATE_ISOLATED,
                    cidr_mask=24,
                ),
            ],
        )

        cdk.CfnOutput(self, "VpcId", value=self.vpc.vpc_id)
        cdk.CfnOutput(
            self,
            "PrivateSubnetIds",
            value=cdk.Fn.join(",", [subnet.subnet_id for subnet in self.vpc.private_subnets]),
        )

