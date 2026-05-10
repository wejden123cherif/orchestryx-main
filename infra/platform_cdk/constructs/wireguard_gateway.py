from __future__ import annotations

from aws_cdk import aws_ec2 as ec2
from aws_cdk import aws_iam as iam
from aws_cdk import aws_secretsmanager as secretsmanager
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
        self.role.add_managed_policy(
            iam.ManagedPolicy.from_aws_managed_policy_name("SecretsManagerReadWrite")
        )

        self.secret = secretsmanager.Secret(
            self,
            "SharedVpnConfig",
            secret_name="orchestryx/vpn/shared",
            description="Shared WireGuard VPN configuration template"
        )
        self.secret.grant_write(self.role)

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
                "PostUp = iptables -t nat -A POSTROUTING -s 10.8.0.0/16 -o ens5 -j MASQUERADE",
                "PostDown = iptables -t nat -D POSTROUTING -s 10.8.0.0/16 -o ens5 -j MASQUERADE",
                "EOF",
                "sysctl -w net.ipv4.ip_forward=1",
                "echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.d/99-wireguard.conf",
                "systemctl enable wg-quick@wg0",
                "systemctl start wg-quick@wg0",
                "cat <<EOF > /tmp/template.txt",
                "[Interface]",
                "PrivateKey = {client_private_key}",
                "Address = {client_ip}/32",
                "DNS = 1.1.1.1",
                "",
                "[Peer]",
                "PublicKey = $SERVER_PUB_KEY",
                "Endpoint = $EIP:51820",
                "AllowedIPs = {lab_private_ip}/32, 10.80.0.0/16",
                "PersistentKeepalive = 25",
                "EOF",
                "TEMPLATE=$(cat /tmp/template.txt)",
                f"aws secretsmanager put-secret-value --secret-id {self.secret.secret_arn} --secret-string \"$TEMPLATE\" --region eu-central-1"
            )

            self.instance = ec2.Instance(
                self,
                "Instance",
                vpc=vpc,
                instance_type=ec2.InstanceType(instance_type),
                machine_image=ec2.MachineImage.latest_amazon_linux2023(),
                role=self.role,
                security_group=self.security_group,
                vpc_subnets=ec2.SubnetSelection(
                    subnet_type=ec2.SubnetType.PUBLIC
                ),
                user_data=user_data,
            )

            self.eip = ec2.CfnEIP(self, "EIP", domain="vpc")
            ec2.CfnEIPAssociation(
                self, "EIPAssociation",
                eip=self.eip.ref,
                instance_id=self.instance.instance_id
            )

