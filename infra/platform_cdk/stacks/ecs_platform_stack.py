from __future__ import annotations

import aws_cdk as cdk
from aws_cdk import aws_ec2 as ec2
from aws_cdk import aws_ecr as ecr
from aws_cdk import aws_ecs as ecs
from aws_cdk import aws_elasticloadbalancingv2 as elbv2
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
        database_security_group_id: str,
        api_log_group: logs.ILogGroup,
        worker_log_group: logs.ILogGroup,
        lab_log_group: logs.ILogGroup,
        database_endpoint: str,
        vpn_security_group: ec2.ISecurityGroup | None = None,
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
        # Shared lab SG: egress-only baseline.
        # Per-lab security groups (created by the worker at RunTask time) carry
        # all inbound rules: tcp/{challenge_port} from {user_vpn_ip}/32 only.
        # No inbound rules are added here -- deny-by-default for all lab tasks.
        self.lab_security_group = ec2.SecurityGroup(
            self,
            "LabSecurityGroup",
            vpc=vpc,
            security_group_name=f"{prefix}-lab-runtime-sg",
            description="Orchestryx ephemeral lab ECS tasks - egress baseline, no ingress",
            allow_all_outbound=True,
        )
        # public_ingress_enabled is intentionally not supported in the Phase 1
        # model. Lab access is VPN-only. Remove or ignore any old config key.
        lab_runtime_config = ecs_config.get("lab_runtime", {})
        # Import the database SG by ID so that the ingress rules below are
        # created as resources in THIS stack (EcsPlatformStack), not in
        # DatabaseStack. Using the SG object directly would cause CDK to place
        # CfnSecurityGroupIngress resources inside DatabaseStack, creating a
        # circular dependency (DatabaseStack -> EcsPlatformStack exports).
        database_security_group = ec2.SecurityGroup.from_security_group_id(
            self,
            "ImportedDatabaseSecurityGroup",
            database_security_group_id,
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
        lab_task_role = iam.Role(
            self,
            "LabTaskRole",
            assumed_by=iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
            role_name=f"{prefix}-lab-task-role",
        )

        for queue in (provision_queue, destroy_queue):
            queue.grant_send_messages(api_task_role)
            queue.grant_consume_messages(worker_task_role)

        api_task_role.add_to_policy(
            iam.PolicyStatement(
                actions=[
                    # Cognito: only the actions the API actually invokes.
                    # AdminGetUser is used to validate tokens; the user-facing
                    # auth endpoints (register, login, confirm, password reset)
                    # use the public Cognito hosted UI or InitiateAuth flows.
                    "cognito-idp:AdminGetUser",
                    "cognito-idp:AdminUpdateUserAttributes",
                    "cognito-idp:AdminDisableUser",
                    "cognito-idp:AdminEnableUser",
                    "cognito-idp:ListUsers",
                    "cognito-idp:InitiateAuth",
                    "cognito-idp:RespondToAuthChallenge",
                    "cognito-idp:SignUp",
                    "cognito-idp:ConfirmSignUp",
                    "cognito-idp:ResendConfirmationCode",
                    "cognito-idp:ForgotPassword",
                    "cognito-idp:ConfirmForgotPassword",
                    "cognito-idp:ChangePassword",
                    "secretsmanager:GetSecretValue",
                    "secretsmanager:DescribeSecret",
                ],
                resources=["*"],
            )
        )
        worker_task_role.add_to_policy(
            iam.PolicyStatement(
                actions=[
                    "ecs:RegisterTaskDefinition",
                    "ecs:RunTask",
                    "ecs:StopTask",
                    "ecs:DescribeTasks",
                    "ecs:DescribeTaskDefinition",
                    "ec2:DescribeNetworkInterfaces",
                    "ec2:DescribeInstances",
                    "ec2:CreateSecurityGroup",
                    "ec2:AuthorizeSecurityGroupIngress",
                    "ec2:DeleteSecurityGroup",
                    "ec2:CreateTags",
                    "logs:CreateLogGroup",
                    "logs:GetLogEvents",
                    "logs:DescribeLogStreams",
                ],
                resources=["*"],
            )
        )
        # SSM permissions scoped to the WireGuard gateway tag to prevent the
        # worker from sending arbitrary commands to other EC2 instances.
        worker_task_role.add_to_policy(
            iam.PolicyStatement(
                actions=["ssm:SendCommand"],
                resources=["*"],
                conditions={
                    "StringLike": {
                        "ssm:resourceTag/Name": "*WireGuardGateway*",
                    }
                },
            )
        )
        worker_task_role.add_to_policy(
            iam.PolicyStatement(
                actions=["ssm:GetCommandInvocation"],
                resources=["*"],
            )
        )
        # Secrets Manager read for VPN config template and runtime config.
        worker_task_role.add_to_policy(
            iam.PolicyStatement(
                actions=["secretsmanager:GetSecretValue"],
                resources=["*"],
            )
        )
        worker_task_role.add_to_policy(
            iam.PolicyStatement(
                actions=["iam:PassRole"],
                resources=[execution_role.role_arn, lab_task_role.role_arn],
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
            "LAB_ECS_CLUSTER": self.cluster.cluster_name,
            "LAB_ECS_SUBNET_IDS": cdk.Fn.join(
                ",",
                vpc.select_subnets(subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS).subnet_ids,
            ),
            "LAB_ECS_SECURITY_GROUP_IDS": self.lab_security_group.security_group_id,
            "LAB_ECS_TASK_EXECUTION_ROLE_ARN": execution_role.role_arn,
            "LAB_ECS_TASK_ROLE_ARN": lab_task_role.role_arn,
            "LAB_ECS_LOG_GROUP": lab_log_group.log_group_name,
            "LAB_ECS_LOG_STREAM_PREFIX": "lab",
            "LAB_ECS_ASSIGN_PUBLIC_IP": "false",
            "LAB_ECS_PUBLIC_ACCESS_ENABLED": "false",
            "LAB_ECS_CPU": str(int(lab_runtime_config.get("cpu", ecs_config.get("cpu", 512)))),
            "LAB_ECS_MEMORY_MIB": str(
                int(lab_runtime_config.get("memory_mib", ecs_config.get("memory_mib", 1024)))
            ),
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
                "-Q",
                f"{provision_queue.queue_name},{destroy_queue.queue_name}",
                "-I",
                "workers.provision,workers.destroy",
                "--beat",
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

        # ── One-off Alembic migration task ────────────────────────────────
        # Invoked via scripts/windows/run-migrations.ps1 or
        # scripts/linux/run-migrations.sh before the first API startup and
        # whenever schema migrations are added.  Uses the API image and task
        # role so it has identical DB/secret access to the API service.
        if runtime_secret is not None:
            _migration_secrets = {
                key: ecs.Secret.from_secrets_manager(runtime_secret, key)
                for key in self.SECRET_KEYS
                if key not in shared_environment
            }
            migration_task_definition = ecs.FargateTaskDefinition(
                self,
                "MigrationTaskDefinition",
                cpu=int(ecs_config.get("cpu", 512)),
                memory_limit_mib=int(ecs_config.get("memory_mib", 1024)),
                execution_role=execution_role,
                task_role=api_task_role,
                family=f"{prefix}-migrate",
            )
            migration_task_definition.add_container(
                "Container",
                container_name="migrate",
                image=ecs.ContainerImage.from_ecr_repository(api_repository, "latest"),
                command=["alembic", "upgrade", "head"],
                environment=shared_environment,
                secrets=_migration_secrets,
                logging=ecs.AwsLogDriver(
                    log_group=api_log_group,
                    stream_prefix="migration",
                ),
            )

        # ── Internet-facing Application Load Balancer ──────────────────────
        # Routes public HTTP traffic to the API service in private subnets.
        # Worker, lab, and VPN resources are never attached to this ALB.
        alb_config = config.get("alb", {})
        alb_enabled = bool(alb_config.get("enabled", False)) and services_enabled

        self.alb: elbv2.ApplicationLoadBalancer | None = None

        if alb_enabled and self.api_service.service is not None:
            alb_security_group = ec2.SecurityGroup(
                self,
                "AlbSecurityGroup",
                vpc=vpc,
                security_group_name=f"{prefix}-alb-sg",
                description="Internet-facing ALB for Orchestryx API",
                allow_all_outbound=True,
            )
            alb_security_group.add_ingress_rule(
                ec2.Peer.any_ipv4(),
                ec2.Port.tcp(80),
                "Allow HTTP from internet",
            )
            # Allow the ALB to forward requests into the API container port.
            # open=False on add_listener prevents CDK from adding a duplicate rule.
            self.api_security_group.add_ingress_rule(
                alb_security_group,
                ec2.Port.tcp(int(ecs_config.get("api_container_port", 8000))),
                "Allow ALB to reach API container",
            )

            self.alb = elbv2.ApplicationLoadBalancer(
                self,
                "ApiAlb",
                vpc=vpc,
                internet_facing=True,
                security_group=alb_security_group,
                vpc_subnets=ec2.SubnetSelection(subnet_type=ec2.SubnetType.PUBLIC),
                load_balancer_name=f"{prefix}-api-alb",
            )

            http_listener = self.alb.add_listener("HttpListener", port=80, open=False)
            http_listener.add_targets(
                "ApiTargets",
                port=int(ecs_config.get("api_container_port", 8000)),
                protocol=elbv2.ApplicationProtocol.HTTP,
                targets=[self.api_service.service],
                deregistration_delay=cdk.Duration.seconds(30),
                health_check=elbv2.HealthCheck(
                    path="/health",
                    healthy_http_codes="200",
                    interval=cdk.Duration.seconds(30),
                    timeout=cdk.Duration.seconds(5),
                    healthy_threshold_count=2,
                    unhealthy_threshold_count=3,
                ),
            )

        # ── Outputs ────────────────────────────────────────────────────────
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
        cdk.CfnOutput(self, "LabSecurityGroupId", value=self.lab_security_group.security_group_id)
        cdk.CfnOutput(self, "LabTaskRoleArn", value=lab_task_role.role_arn)
        cdk.CfnOutput(self, "ApiSecurityGroupId", value=self.api_security_group.security_group_id)
        if runtime_secret is not None:
            cdk.CfnOutput(
                self,
                "MigrationTaskDefinitionArn",
                value=migration_task_definition.task_definition_arn,
            )
        if self.alb is not None:
            cdk.CfnOutput(
                self,
                "ApiLoadBalancerDnsName",
                value=self.alb.load_balancer_dns_name,
            )
            cdk.CfnOutput(
                self,
                "ApiBaseUrl",
                value=cdk.Fn.join("", ["http://", self.alb.load_balancer_dns_name]),
            )
