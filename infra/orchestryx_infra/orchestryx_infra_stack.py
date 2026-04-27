from aws_cdk import (
    Stack,
    aws_ec2 as ec2,
    aws_iam as iam,
    CfnOutput,
    Tags,
)
from constructs import Construct


class LabStack(Stack):
    """
    Base CDK stack for an Orchestryx lab environment.
    Creates an isolated VPC with a single EC2 instance running
    a challenge Docker container and WireGuard VPN server.

    One instance of this stack = one lab session for one user.
    Stack name format: orchestryx-lab-{instance_id}
    """

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        instance_id: str,
        docker_image: str,
        wg_server_privkey: str,
        wg_client_pubkey: str,
        flag: str,
        instance_type: str = "t3.small",
        **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ─── VPC ───
        # Each lab gets its own isolated VPC — no traffic between users
        vpc = ec2.Vpc(
            self, "LabVPC",
            vpc_name=f"orchestryx-lab-{instance_id}",
            ip_addresses=ec2.IpAddresses.cidr("10.0.0.0/16"),
            max_azs=1,
            nat_gateways=0,  # no NAT gateway — saves cost
            subnet_configuration=[
                ec2.SubnetConfiguration(
                    name="Public",
                    subnet_type=ec2.SubnetType.PUBLIC,
                    cidr_mask=24,
                )
            ],
        )

        # ─── SECURITY GROUP ───
        # Only allow WireGuard UDP inbound — everything else blocked
        sg = ec2.SecurityGroup(
            self, "LabSG",
            vpc=vpc,
            security_group_name=f"orchestryx-lab-sg-{instance_id}",
            description="Orchestryx lab security group - WireGuard only",
            allow_all_outbound=True,  # allow outbound for Docker pulls
        )

        # WireGuard VPN port — this is the only way users access the lab
        sg.add_ingress_rule(
            ec2.Peer.any_ipv4(),
            ec2.Port.udp(51820),
            "WireGuard VPN access"
        )

        # ─── EC2 USER DATA ───
        # This script runs automatically when EC2 boots
        # It installs Docker, starts the challenge container, and configures WireGuard
        user_data = ec2.UserData.for_linux()
        user_data.add_commands(
            # Update and install dependencies
            "apt-get update -y",
            "apt-get install -y docker.io wireguard awscli",
            "systemctl start docker",
            "systemctl enable docker",

            # Pull and run the challenge Docker container
            f"docker pull {docker_image}",
            f"docker run -d --name challenge -p 3000:3000 -e FLAG='{flag}' {docker_image}",

            # Generate WireGuard server config
            "mkdir -p /etc/wireguard",
            f"echo '[Interface]' > /etc/wireguard/wg0.conf",
            f"echo 'PrivateKey = {wg_server_privkey}' >> /etc/wireguard/wg0.conf",
            f"echo 'Address = 10.8.0.1/24' >> /etc/wireguard/wg0.conf",
            f"echo 'ListenPort = 51820' >> /etc/wireguard/wg0.conf",
            f"echo 'PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE' >> /etc/wireguard/wg0.conf",
            f"echo 'PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE' >> /etc/wireguard/wg0.conf",
            f"echo '' >> /etc/wireguard/wg0.conf",
            f"echo '[Peer]' >> /etc/wireguard/wg0.conf",
            f"echo 'PublicKey = {wg_client_pubkey}' >> /etc/wireguard/wg0.conf",
            f"echo 'AllowedIPs = 10.8.0.2/32' >> /etc/wireguard/wg0.conf",

            # Enable IP forwarding
            "echo 'net.ipv4.ip_forward = 1' >> /etc/sysctl.conf",
            "sysctl -p",

            # Start WireGuard
            "wg-quick up wg0",
            "systemctl enable wg-quick@wg0",
        )

        # ─── EC2 INSTANCE ───
        instance = ec2.Instance(
            self, "LabInstance",
            instance_name=f"orchestryx-lab-{instance_id}",
            instance_type=ec2.InstanceType(instance_type),
            # Ubuntu 22.04 LTS AMI (eu-central-1)
            machine_image=ec2.MachineImage.generic_linux({
                "eu-central-1": "ami-0faab6bdbac9486fb"
            }),
            vpc=vpc,
            vpc_subnets=ec2.SubnetSelection(
                subnet_type=ec2.SubnetType.PUBLIC
            ),
            security_group=sg,
            user_data=user_data,
            # No IAM role — lab machines cannot access AWS APIs
            require_imdsv2=True,  # IMDSv2 only — prevents SSRF attacks
        )

        # ─── TAGS ───
        # Tag everything for cost tracking and cleanup
        Tags.of(self).add("Project", "orchestryx")
        Tags.of(self).add("InstanceId", instance_id)
        Tags.of(self).add("ManagedBy", "orchestryx-cdk")

        # ─── OUTPUTS ───
        # These are read by the Celery worker after deploy
        CfnOutput(
            self, "EC2PublicIP",
            value=instance.instance_public_ip,
            description="Public IP of the lab EC2 instance",
            export_name=f"orchestryx-lab-{instance_id}-ip"
        )

        CfnOutput(
            self, "EC2InstanceId",
            value=instance.instance_id,
            description="EC2 instance ID",
            export_name=f"orchestryx-lab-{instance_id}-ec2id"
        )