from __future__ import annotations

from aws_cdk import aws_ec2 as ec2
from aws_cdk import aws_ecr as ecr
from aws_cdk import aws_ecs as ecs
from aws_cdk import aws_iam as iam
from aws_cdk import aws_logs as logs
from aws_cdk import aws_secretsmanager as secretsmanager
from constructs import Construct


class OrchestryxFargateService(Construct):
    """Reusable ECS Fargate service construct for API and worker runtimes."""

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        cluster: ecs.Cluster,
        vpc: ec2.IVpc,
        repository: ecr.IRepository,
        log_group: logs.ILogGroup,
        service_name: str,
        container_name: str,
        command: list[str],
        cpu: int,
        memory_mib: int,
        desired_count: int,
        runtime_secret: secretsmanager.ISecret | None,
        runtime_secret_keys: list[str],
        environment: dict[str, str],
        security_group: ec2.ISecurityGroup,
        task_role: iam.IRole,
        execution_role: iam.IRole,
        enabled: bool,
        container_port: int | None = None,
    ) -> None:
        super().__init__(scope, construct_id)

        self.service: ecs.FargateService | None = None
        self.task_definition: ecs.FargateTaskDefinition | None = None

        if not enabled:
            return

        self.task_definition = ecs.FargateTaskDefinition(
            self,
            "TaskDefinition",
            cpu=cpu,
            memory_limit_mib=memory_mib,
            execution_role=execution_role,
            task_role=task_role,
            family=service_name.replace("-service", ""),
        )

        secrets = {}
        if runtime_secret is not None:
            # Only add secrets for keys not already in environment to avoid conflicts
            secrets = {
                key: ecs.Secret.from_secrets_manager(runtime_secret, key)
                for key in runtime_secret_keys
                if key not in environment
            }

        container = self.task_definition.add_container(
            "Container",
            container_name=container_name,
            image=ecs.ContainerImage.from_ecr_repository(repository, "latest"),
            command=command,
            environment=environment,
            secrets=secrets,
            logging=ecs.AwsLogDriver(log_group=log_group, stream_prefix="ecs"),
        )
        if container_port is not None:
            container.add_port_mappings(ecs.PortMapping(container_port=container_port))

        self.service = ecs.FargateService(
            self,
            "Service",
            cluster=cluster,
            service_name=service_name,
            task_definition=self.task_definition,
            desired_count=desired_count,
            assign_public_ip=False,
            security_groups=[security_group],
            vpc_subnets=ec2.SubnetSelection(subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS),
        )

