from __future__ import annotations

import aws_cdk as cdk
from aws_cdk import aws_ec2 as ec2
from aws_cdk import aws_ecr as ecr
from aws_cdk import aws_ecs as ecs
from aws_cdk import aws_iam as iam
from aws_cdk import aws_logs as logs
from aws_cdk import aws_secretsmanager as secretsmanager
from aws_cdk import aws_sqs as sqs
from constructs import Construct

from fargate_service import OrchestryxFargateService


class EcsPlatformStack(cdk.Stack):
    """ECS cluster, IAM roles, task definitions, and service foundation."""

    SECRET_KEYS = [
        "DATABASE_URL",
        "SQL_ECHO",
        "DB_SSL_MODE",
        "AWS_REGION",
        "AWS_ACCOUNT_ID",
        "COGNITO_USER_POOL_ID",
        "COGNITO_APP_CLIENT_ID",
        "PROVISION_QUEUE",
        "DESTROY_QUEUE",
        "SQS_PROVISION_URL",
        "SQS_DESTROY_URL",
        "CORS_ALLOWED_ORIGINS",
        "LAB_RUNTIME_ENABLED",
    ]

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        config: dict,
        env_name: str,
        vpc: ec2.IVpc,
        api_repository: ecr.IRepository,
        worker_repository: ecr.IRepository,
        provision_queue: sqs.IQueue,
        destroy_queue: sqs.IQueue,
        user_pool,
        user_pool_client,
        database_security_group: ec2.ISecurityGroup,
        api_log_group: logs.ILogGroup,
        worker_log_group: logs.ILogGroup,
        database_endpoint: str,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        ecs_config = config.get("ecs", {})
        prefix = config.get("naming", {}).get("resource_prefix", f"orchestryx-{env_name}")
        services_enabled = bool(ecs_config.get("services_enabled", False))

        self.cluster = ecs.Cluster(
            self,
            "Cluster",
            cluster_name=ecs_config.get("cluster_name", f"orchestryx-{env_name}"),
            vpc=vpc,
        )

        self.api_security_group = ec2.SecurityGroup(
            self,
            "ApiSecurityGroup",
            vpc=vpc,
            security_group_name=f"{prefix}-api-sg",
            description="Orchestryx API ECS tasks",
            allow_all_outbound=True,
        )
        self.worker_security_group = ec2.SecurityGroup(
            self,
            "WorkerSecurityGroup",
            vpc=vpc,
            security_group_name=f"{prefix}-worker-sg",
            description="Orchestryx worker ECS tasks",
            allow_all_outbound=True,
        )
        database_security_group.add_ingress_rule(
            self.api_security_group,
            ec2.Port.tcp(5432),
            "Allow API tasks to reach PostgreSQL",
        )
        database_security_group.add_ingress_rule(
            self.worker_security_group,
            ec2.Port.tcp(5432),
            "Allow worker tasks to reach PostgreSQL",
        )

        execution_role = iam.Role(
            self,
            "TaskExecutionRole",
            assumed_by=iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
            role_name=f"{prefix}-ecs-execution-role",
        )
        execution_role.add_managed_policy(
            iam.ManagedPolicy.from_aws_managed_policy_name(
                "service-role/AmazonECSTaskExecutionRolePolicy"
            )
        )

        api_task_role = iam.Role(
            self,
            "ApiTaskRole",
            assumed_by=iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
            role_name=f"{prefix}-api-task-role",
        )
        worker_task_role = iam.Role(
            self,
            "WorkerTaskRole",
            assumed_by=iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
            role_name=f"{prefix}-worker-task-role",
        )

        for queue in (provision_queue, destroy_queue):
            queue.grant_send_messages(api_task_role)
            queue.grant_consume_messages(worker_task_role)

        api_task_role.add_to_policy(
            iam.PolicyStatement(
                actions=[
                    "cognito-idp:*",
                    "secretsmanager:GetSecretValue",
                    "secretsmanager:DescribeSecret",
                ],
                resources=["*"],
            )
        )

        runtime_secret = None
        runtime_secret_name = ecs_config.get("runtime_secret_name")
        if runtime_secret_name:
            runtime_secret = secretsmanager.Secret.from_secret_name_v2(
                self,
                "RuntimeSecret",
                runtime_secret_name,
            )
            runtime_secret.grant_read(execution_role)
            runtime_secret.grant_read(api_task_role)
            runtime_secret.grant_read(worker_task_role)

        shared_environment = {
            "PYTHONUNBUFFERED": "1",
            "AWS_REGION": cdk.Stack.of(self).region,
            "COGNITO_USER_POOL_ID": user_pool.user_pool_id,
            "COGNITO_APP_CLIENT_ID": user_pool_client.user_pool_client_id,
            "PROVISION_QUEUE": provision_queue.queue_name,
            "DESTROY_QUEUE": destroy_queue.queue_name,
            "SQS_PROVISION_URL": provision_queue.queue_url,
            "SQS_DESTROY_URL": destroy_queue.queue_url,
        }

        self.api_service = OrchestryxFargateService(
            self,
            "ApiService",
            cluster=self.cluster,
            vpc=vpc,
            repository=api_repository,
            log_group=api_log_group,
            service_name=ecs_config.get(
                "api_service_name", f"orchestryx-{env_name}-api-service"
            ),
            container_name="orchestryx-api",
            command=[
                "uvicorn",
                "apps.api.main:app",
                "--host",
                "0.0.0.0",
                "--port",
                str(ecs_config.get("api_container_port", 8000)),
            ],
            cpu=int(ecs_config.get("cpu", 512)),
            memory_mib=int(ecs_config.get("memory_mib", 1024)),
            desired_count=int(ecs_config.get("desired_count", 1)),
            runtime_secret=runtime_secret,
            runtime_secret_keys=self.SECRET_KEYS,
            environment=shared_environment,
            security_group=self.api_security_group,
            task_role=api_task_role,
            execution_role=execution_role,
            enabled=services_enabled,
            container_port=int(ecs_config.get("api_container_port", 8000)),
        )

        self.worker_service = OrchestryxFargateService(
            self,
            "WorkerService",
            cluster=self.cluster,
            vpc=vpc,
            repository=worker_repository,
            log_group=worker_log_group,
            service_name=ecs_config.get(
                "worker_service_name", f"orchestryx-{env_name}-worker-service"
            ),
            container_name="orchestryx-worker",
            command=[
                "celery",
                "-A",
                "workers.celery_app",
                "worker",
                "--loglevel=info",
                "--pool=solo",
                "-I",
                "workers.provision,workers.destroy",
            ],
            cpu=int(ecs_config.get("cpu", 512)),
            memory_mib=int(ecs_config.get("memory_mib", 1024)),
            desired_count=int(ecs_config.get("desired_count", 1)),
            runtime_secret=runtime_secret,
            runtime_secret_keys=self.SECRET_KEYS,
            environment=shared_environment,
            security_group=self.worker_security_group,
            task_role=worker_task_role,
            execution_role=execution_role,
            enabled=services_enabled,
        )

        cdk.CfnOutput(self, "EcsClusterName", value=self.cluster.cluster_name)
        cdk.CfnOutput(
            self,
            "ApiServiceName",
            value=ecs_config.get("api_service_name", f"orchestryx-{env_name}-api-service"),
        )
        cdk.CfnOutput(
            self,
            "WorkerServiceName",
            value=ecs_config.get(
                "worker_service_name", f"orchestryx-{env_name}-worker-service"
            ),
        )
