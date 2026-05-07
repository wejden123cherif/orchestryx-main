import shlex

from aws_cdk import (
    CfnOutput,
    Stack,
    Tags,
    aws_ec2 as ec2,
    aws_iam as iam,  # NEW: needed for ECR pull permissions on the EC2 instance
)
from constructs import Construct


class LabStack(Stack):
    """
    Base CDK stack for one Orchestryx lab session.

    The stack creates a dedicated VPC, a single public EC2 instance, Docker for
    the challenge container, and WireGuard as the only public entry point.
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
        challenge_port: int = 3000,
        challenge_path: str = "/",
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # User data is rendered as shell. Quote attacker-controlled or
        # database-controlled strings before embedding them into shell commands.
        quoted_docker_image = shlex.quote(docker_image)
        quoted_flag = shlex.quote(flag)

        normalized_challenge_path = challenge_path.strip()
        if normalized_challenge_path == "" or normalized_challenge_path == "/":
            normalized_challenge_path = ""
        elif not normalized_challenge_path.startswith("/"):
            normalized_challenge_path = "/" + normalized_challenge_path

        # One lab session gets one VPC. Keeping sessions in separate VPCs gives
        # us a clean isolation boundary while the MVP still uses one EC2 host.
        vpc = ec2.Vpc(
            self,
            "LabVPC",
            vpc_name=f"orchestryx-lab-{instance_id}",
            ip_addresses=ec2.IpAddresses.cidr("10.0.0.0/16"),
            max_azs=1,
            nat_gateways=0,
            subnet_configuration=[
                ec2.SubnetConfiguration(
                    name="Public",
                    subnet_type=ec2.SubnetType.PUBLIC,
                    cidr_mask=24,
                )
            ],
        )

        # The lab has a public IP only so WireGuard clients can connect.
        # Challenge HTTP ports are not opened to the internet.
        security_group = ec2.SecurityGroup(
            self,
            "LabSG",
            vpc=vpc,
            security_group_name=f"orchestryx-lab-sg-{instance_id}",
            description="Orchestryx lab security group - WireGuard only",
            allow_all_outbound=True,
        )
        security_group.add_ingress_rule(
            ec2.Peer.any_ipv4(),
            ec2.Port.udp(51820),
            "WireGuard VPN access",
        )

        # This boot script installs the runtime, starts the challenge container,
        # configures WireGuard, and fails loudly into /var/log/orchestryx-lab-init.log.
        # The next infra step will replace docker run with generated docker-compose.
        user_data = ec2.UserData.for_linux()
        user_data.add_commands(
            "set -euxo pipefail",
            "exec > >(tee /var/log/orchestryx-lab-init.log|logger -t orchestryx-lab-init -s 2>/dev/console) 2>&1",
            "export DEBIAN_FRONTEND=noninteractive",
            "apt-get update -y",
            # NEW: Install awscli alongside docker/wireguard so we can authenticate with ECR.
            # Without awscli, the EC2 instance can't run 'aws ecr get-login-password'.
            "apt-get install -y --no-install-recommends docker.io wireguard iptables curl awscli",
            "systemctl enable --now docker",
            # NEW: Authenticate Docker with ECR before pulling.
            # The EC2 instance has an IAM role (added below) that grants ecr:GetAuthorizationToken
            # and ecr:BatchGetImage. This login command gets a temporary token from ECR and
            # pipes it to docker login. Without this, `docker pull` from ECR returns
            # "no basic auth credentials".
            # For public Docker Hub images, this step is harmless (login just succeeds or is skipped).
            f"aws ecr get-login-password --region {self.region} | docker login --username AWS --password-stdin {self.account}.dkr.ecr.{self.region}.amazonaws.com || true",
            f"docker pull {quoted_docker_image}",
            "docker rm -f challenge || true",
            f"docker run -d --restart unless-stopped --name challenge -p {challenge_port}:{challenge_port} -e FLAG={quoted_flag} {quoted_docker_image}",
            "install -d -m 700 /etc/wireguard",
            f"""cat > /etc/wireguard/wg0.conf <<'EOF'
[Interface]
PrivateKey = {wg_server_privkey}
Address = 10.8.0.1/24
ListenPort = 51820
PostUp = iptables -A INPUT -i wg0 -p tcp --dport {challenge_port} -j ACCEPT; iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o eth0 -j MASQUERADE
PostDown = iptables -D INPUT -i wg0 -p tcp --dport {challenge_port} -j ACCEPT; iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -s 10.8.0.0/24 -o eth0 -j MASQUERADE

[Peer]
PublicKey = {wg_client_pubkey}
AllowedIPs = 10.8.0.2/32
EOF""",
            "chmod 600 /etc/wireguard/wg0.conf",
            "printf 'net.ipv4.ip_forward = 1\\n' > /etc/sysctl.d/99-orchestryx-lab.conf",
            "sysctl --system",
            "systemctl enable wg-quick@wg0",
            "systemctl restart wg-quick@wg0",
            # Basic health check so a broken container image fails during boot
            # instead of silently producing a RUNNING lab that users cannot use.
            f"curl -fsS --retry 5 --retry-delay 3 http://127.0.0.1:{challenge_port}{normalized_challenge_path} >/dev/null",
            "docker ps --filter name=challenge --format '{{.Names}} {{.Status}}'",
        )

        # The instance is deliberately small and cheap for MVP labs. The root
        # disk is encrypted GP3 so lab data is not left on unencrypted EBS.
        instance = ec2.Instance(
            self,
            "LabInstance",
            instance_name=f"orchestryx-lab-{instance_id}",
            instance_type=ec2.InstanceType(instance_type),
            machine_image=ec2.MachineImage.generic_linux(
                {
                    # Ubuntu Server 22.04 LTS in eu-central-1.
                    "eu-central-1": "ami-0faab6bdbac9486fb",
                }
            ),
            vpc=vpc,
            vpc_subnets=ec2.SubnetSelection(
                subnet_type=ec2.SubnetType.PUBLIC,
            ),
            security_group=security_group,
            user_data=user_data,
            block_devices=[
                ec2.BlockDevice(
                    device_name="/dev/sda1",
                    volume=ec2.BlockDeviceVolume.ebs(
                        volume_size=20,
                        encrypted=True,
                        volume_type=ec2.EbsDeviceVolumeType.GP3,
                    ),
                )
            ],
            # NEW: Attach an IAM role so the EC2 instance can pull from ECR.
            # Without a role, the EC2 has no AWS credentials and can't call
            # ecr:GetAuthorizationToken or ecr:BatchGetImage.
            role=iam.Role(
                self,
                "LabInstanceRole",
                assumed_by=iam.ServicePrincipal("ec2.amazonaws.com"),
                description="Allows lab EC2 instances to pull Docker images from ECR",
                managed_policies=[
                    # AmazonEC2ContainerRegistryReadOnly grants:
                    #   ecr:GetAuthorizationToken
                    #   ecr:BatchCheckLayerAvailability
                    #   ecr:GetDownloadUrlForLayer
                    #   ecr:BatchGetImage
                    # This is read-only — the instance can pull but not push.
                    iam.ManagedPolicy.from_aws_managed_policy_name(
                        "AmazonEC2ContainerRegistryReadOnly"
                    ),
                ],
            ),
            require_imdsv2=True,
        )

        # These tags make cost tracking and manual cleanup easier in AWS.
        Tags.of(self).add("Project", "orchestryx")
        Tags.of(self).add("InstanceId", instance_id)
        Tags.of(self).add("ManagedBy", "orchestryx-cdk")
        Tags.of(self).add("LabTemplateImage", docker_image)

        # The worker reads these CloudFormation outputs after deploy and stores
        # the VPN config plus lab metadata back into the database.
        CfnOutput(
            self,
            "EC2PublicIP",
            value=instance.instance_public_ip,
            description="Public IP of the lab EC2 instance",
            export_name=f"orchestryx-lab-{instance_id}-ip",
        )
        CfnOutput(
            self,
            "EC2InstanceId",
            value=instance.instance_id,
            description="EC2 instance ID",
            export_name=f"orchestryx-lab-{instance_id}-ec2id",
        )
        CfnOutput(
            self,
            "ChallengeURL",
            value=f"http://10.8.0.1:{challenge_port}{normalized_challenge_path}",
            description="Challenge URL reachable after connecting to WireGuard",
            export_name=f"orchestryx-lab-{instance_id}-challenge-url",
        )
