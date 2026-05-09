from __future__ import annotations

from aws_cdk import aws_ec2 as ec2
from aws_cdk import aws_iam as iam
from constructs import Construct


class WireGuardGateway(Construct):
    """Foundation for a future shared WireGuard gateway.

    The EC2 instance is opt-in because existing lab stacks still create their
    own WireGuard endpoint and active provisioning must not be disturbed.
    """

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        vpc: ec2.IVpc,
        resource_prefix: str,
        instance_type: str,
        enabled: bool,
    ) -> None:
        super().__init__(scope, construct_id)

        self.security_group = ec2.SecurityGroup(
            self,
            "SecurityGroup",
            vpc=vpc,
            security_group_name=f"{resource_prefix}-wireguard-sg",
            description="Shared WireGuard gateway foundation",
            allow_all_outbound=True,
        )
        self.security_group.add_ingress_rule(
            ec2.Peer.any_ipv4(),
            ec2.Port.udp(51820),
            "WireGuard VPN",
        )

        self.role = iam.Role(
            self,
            "InstanceRole",
            assumed_by=iam.ServicePrincipal("ec2.amazonaws.com"),
            description="Future shared WireGuard gateway instance role",
        )
        self.role.add_managed_policy(
            iam.ManagedPolicy.from_aws_managed_policy_name("AmazonSSMManagedInstanceCore")
        )

        self.instance: ec2.Instance | None = None
        if enabled:
            self.instance = ec2.Instance(
                self,
                "Instance",
                vpc=vpc,
                instance_type=ec2.InstanceType(instance_type),
                machine_image=ec2.MachineImage.latest_amazon_linux2023(),
                role=self.role,
                security_group=self.security_group,
                vpc_subnets=ec2.SubnetSelection(
                    subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS
                ),
            )

