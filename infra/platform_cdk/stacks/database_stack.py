from __future__ import annotations

import aws_cdk as cdk
from aws_cdk import Duration, aws_ec2 as ec2, aws_rds as rds
from constructs import Construct


class DatabaseStack(cdk.Stack):
    """Aurora PostgreSQL foundation.

    Creation is disabled by default so existing manually-created databases can
    be imported or migrated later without replacement.
    """

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        config: dict,
        env_name: str,
        vpc: ec2.IVpc,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        database = config.get("database", {})
        prefix = config.get("naming", {}).get("resource_prefix", f"orchestryx-{env_name}")

        self.database_security_group = ec2.SecurityGroup(
            self,
            "DatabaseSecurityGroup",
            vpc=vpc,
            security_group_name=f"{prefix}-aurora-sg",
            description="Aurora PostgreSQL access for Orchestryx services",
            allow_all_outbound=True,
        )

        self.cluster: rds.DatabaseCluster | None = None
        self.database_endpoint = "not-provisioned"

        if bool(database.get("enabled", False)):
            self.cluster = rds.DatabaseCluster(
                self,
                "AuroraCluster",
                cluster_identifier=database.get(
                    "cluster_identifier", f"orchestryx-{env_name}-db"
                ),
                engine=rds.DatabaseClusterEngine.aurora_postgres(
                    version=rds.AuroraPostgresEngineVersion.VER_15_8
                ),
                writer=rds.ClusterInstance.serverless_v2("writer"),
                serverless_v2_min_capacity=float(database.get("min_acu", 0.5)),
                serverless_v2_max_capacity=float(database.get("max_acu", 2)),
                default_database_name=database.get("database_name", "orchestryx"),
                vpc=vpc,
                security_groups=[self.database_security_group],
                vpc_subnets=ec2.SubnetSelection(
                    subnet_type=ec2.SubnetType.PRIVATE_ISOLATED
                ),
                backup=rds.BackupProps(
                    retention=Duration.days(int(database.get("backup_retention_days", 7)))
                ),
                deletion_protection=True,
                removal_policy=cdk.RemovalPolicy.RETAIN,
            )
            self.database_endpoint = self.cluster.cluster_endpoint.hostname

        cdk.CfnOutput(
            self,
            "DatabaseSecurityGroupId",
            value=self.database_security_group.security_group_id,
        )
        cdk.CfnOutput(self, "DatabaseEndpoint", value=self.database_endpoint)
        if self.cluster is not None and self.cluster.secret is not None:
            cdk.CfnOutput(
                self,
                "DatabaseSecretArn",
                value=self.cluster.secret.secret_arn,
            )
