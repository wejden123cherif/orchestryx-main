from __future__ import annotations

import aws_cdk as cdk
from aws_cdk import aws_ec2 as ec2
from aws_cdk import aws_iam as iam
from aws_cdk import aws_secretsmanager as secretsmanager
from constructs import Construct


class WireGuardGateway(Construct):
    """Shared WireGuard VPN gateway for per-lab routed access.

    Operates in ROUTED mode (not NAT/MASQUERADE mode) so that VPN client IPs
    are preserved as the source IP when traffic reaches lab ECS tasks.
    This enables per-lab EC2 security group rules like:
        tcp/{challenge_port} from {user_vpn_ip}/32
    which would be impossible if the gateway used SNAT/MASQUERADE.

    Route table entries for 10.8.0.0/16 -> this instance are added in VpnStack
    for all private subnets so that lab containers can respond back to VPN clients.

    Source/destination check is disabled on the EC2 instance so it can forward
    packets that are not addressed to itself.
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
        vpc_cidr: str = "10.80.0.0/16",
    ) -> None:
        super().__init__(scope, construct_id)

        self.security_group = ec2.SecurityGroup(
            self,
            "SecurityGroup",
            vpc=vpc,
            security_group_name=f"{resource_prefix}-wireguard-sg",
            description="WireGuard gateway - UDP 51820 inbound for VPN clients",
            allow_all_outbound=True,
        )
        self.security_group.add_ingress_rule(
            ec2.Peer.any_ipv4(),
            ec2.Port.udp(51820),
            "WireGuard VPN client connections",
        )

        self.role = iam.Role(
            self,
            "InstanceRole",
            assumed_by=iam.ServicePrincipal("ec2.amazonaws.com"),
            description="WireGuard gateway instance role",
        )
        self.role.add_managed_policy(
            iam.ManagedPolicy.from_aws_managed_policy_name("AmazonSSMManagedInstanceCore")
        )

        self.secret = secretsmanager.Secret(
            self,
            "SharedVpnConfig",
            secret_name="orchestryx/vpn/shared",
            description="WireGuard client config template (server pubkey + endpoint)",
        )
        # The gateway writes the server public key into this secret at startup.
        # Only put-secret-value on its own secret is needed, not broad ReadWrite.
        self.secret.grant_write(self.role)
        self.role.add_to_policy(
            iam.PolicyStatement(
                actions=["secretsmanager:GetSecretValue"],
                resources=[self.secret.secret_arn],
            )
        )

        self.instance: ec2.Instance | None = None
        if enabled:
            user_data = ec2.UserData.for_linux()
            user_data.add_commands(
                "dnf update -y",
                "dnf install -y wireguard-tools iptables jq aws-cli",
                "cd /etc/wireguard",
                "umask 077",
                "wg genkey | tee privatekey | wg pubkey > publickey",
                "SERVER_PRIV_KEY=$(cat privatekey)",
                "SERVER_PUB_KEY=$(cat publickey)",
                "TOKEN=$(curl -X PUT \"http://169.254.169.254/latest/api/token\" -H \"X-aws-ec2-metadata-token-ttl-seconds: 21600\")",
                "EIP=$(curl -H \"X-aws-ec2-metadata-token: $TOKEN\" -s http://169.254.169.254/latest/meta-data/public-ipv4)",
                "cat <<EOF > wg0.conf",
                "[Interface]",
                "Address = 10.8.0.1/16",
                "ListenPort = 51820",
                "PrivateKey = $SERVER_PRIV_KEY",
                # ROUTED mode: MASQUERADE only for traffic destined outside the VPC.
                # Traffic to VPC IPs (lab containers) is forwarded without SNAT so
                # that the source VPN IP is preserved for per-lab SG rules.
                f"PostUp = iptables -t nat -A POSTROUTING -s 10.8.0.0/16 ! -d {vpc_cidr} -o ens5 -j MASQUERADE",
                f"PostDown = iptables -t nat -D POSTROUTING -s 10.8.0.0/16 ! -d {vpc_cidr} -o ens5 -j MASQUERADE",
                "EOF",
                "sysctl -w net.ipv4.ip_forward=1",
                "echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.d/99-wireguard.conf",
                "systemctl enable wg-quick@wg0",
                "systemctl start wg-quick@wg0",
                # Store the client config template in Secrets Manager.
                # AllowedIPs uses {lab_private_ip}/32 -- NOT the VPC CIDR -- so
                # each connected client routes only to their own lab, not all labs.
                "cat <<EOF > /tmp/template.txt",
                "[Interface]",
                "PrivateKey = {client_private_key}",
                "Address = {client_ip}/32",
                "DNS = 1.1.1.1",
                "",
                "[Peer]",
                "PublicKey = $SERVER_PUB_KEY",
                "Endpoint = $EIP:51820",
                "AllowedIPs = {lab_private_ip}/32",
                "PersistentKeepalive = 25",
                "EOF",
                "TEMPLATE=$(cat /tmp/template.txt)",
                (
                    "aws secretsmanager put-secret-value "
                    f"--secret-id {self.secret.secret_arn} "
                    "--secret-string \"$TEMPLATE\" "
                    f"--region {cdk.Stack.of(self).region}"
                ),
            )

            self.instance = ec2.Instance(
                self,
                "Instance",
                vpc=vpc,
                instance_type=ec2.InstanceType(instance_type),
                machine_image=ec2.MachineImage.latest_amazon_linux2023(),
                role=self.role,
                security_group=self.security_group,
                vpc_subnets=ec2.SubnetSelection(subnet_type=ec2.SubnetType.PUBLIC),
                user_data=user_data,
            )

            # Disable source/destination check so the instance can forward packets
            # between VPN clients and VPC-internal lab containers.
            cfn_instance = self.instance.node.default_child
            cfn_instance.source_dest_check = False

            self.eip = ec2.CfnEIP(self, "EIP", domain="vpc")
            ec2.CfnEIPAssociation(
                self,
                "EIPAssociation",
                eip=self.eip.ref,
                instance_id=self.instance.instance_id,
            )

