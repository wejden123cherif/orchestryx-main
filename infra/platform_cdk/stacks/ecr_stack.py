from __future__ import annotations

import aws_cdk as cdk
from aws_cdk import aws_ecr as ecr
from constructs import Construct


class EcrStack(cdk.Stack):
    """Container repositories for the API and worker images."""

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

        ecr_config = config.get("ecr", {})

        self.api_repository = ecr.Repository(
            self,
            "ApiRepository",
            repository_name=ecr_config.get("api_repository_name", f"orchestryx-{env_name}-api"),
            image_scan_on_push=True,
            lifecycle_rules=[ecr.LifecycleRule(max_image_count=25)],
            removal_policy=cdk.RemovalPolicy.RETAIN,
        )
        self.worker_repository = ecr.Repository(
            self,
            "WorkerRepository",
            repository_name=ecr_config.get(
                "worker_repository_name", f"orchestryx-{env_name}-worker"
            ),
            image_scan_on_push=True,
            lifecycle_rules=[ecr.LifecycleRule(max_image_count=25)],
            removal_policy=cdk.RemovalPolicy.RETAIN,
        )

        cdk.CfnOutput(self, "ApiRepositoryUri", value=self.api_repository.repository_uri)
        cdk.CfnOutput(self, "WorkerRepositoryUri", value=self.worker_repository.repository_uri)

