from __future__ import annotations

import aws_cdk as cdk
from aws_cdk import aws_logs as logs
from constructs import Construct


class ObservabilityStack(cdk.Stack):
    """CloudWatch log groups and baseline observability resources."""

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

        observability = config.get("observability", {})
        retention_days = int(observability.get("retention_days", 30))
        retention_map = {
            1: logs.RetentionDays.ONE_DAY,
            3: logs.RetentionDays.THREE_DAYS,
            5: logs.RetentionDays.FIVE_DAYS,
            7: logs.RetentionDays.ONE_WEEK,
            14: logs.RetentionDays.TWO_WEEKS,
            30: logs.RetentionDays.ONE_MONTH,
            60: logs.RetentionDays.TWO_MONTHS,
            90: logs.RetentionDays.THREE_MONTHS,
            180: logs.RetentionDays.SIX_MONTHS,
            365: logs.RetentionDays.ONE_YEAR,
        }
        retention = retention_map.get(retention_days, logs.RetentionDays.ONE_MONTH)

        self.api_log_group = logs.LogGroup(
            self,
            "ApiLogGroup",
            log_group_name=observability.get(
                "api_log_group_name", f"/ecs/orchestryx-{env_name}-api"
            ),
            retention=retention,
            removal_policy=cdk.RemovalPolicy.RETAIN,
        )
        self.worker_log_group = logs.LogGroup(
            self,
            "WorkerLogGroup",
            log_group_name=observability.get(
                "worker_log_group_name", f"/ecs/orchestryx-{env_name}-worker"
            ),
            retention=retention,
            removal_policy=cdk.RemovalPolicy.RETAIN,
        )

        cdk.CfnOutput(self, "ApiLogGroupName", value=self.api_log_group.log_group_name)
        cdk.CfnOutput(self, "WorkerLogGroupName", value=self.worker_log_group.log_group_name)
