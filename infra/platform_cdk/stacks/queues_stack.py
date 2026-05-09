from __future__ import annotations

import aws_cdk as cdk
from aws_cdk import Duration, aws_sqs as sqs
from constructs import Construct


class QueuesStack(cdk.Stack):
    """SQS queues used by the API to dispatch lab lifecycle work."""

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

        queues = config.get("queues", {})

        self.provision_queue = sqs.Queue(
            self,
            "ProvisionQueue",
            queue_name=queues.get(
                "provision_queue_name", f"orchestryx-{env_name}-provision-lab"
            ),
            visibility_timeout=Duration.minutes(15),
            retention_period=Duration.days(4),
        )
        self.destroy_queue = sqs.Queue(
            self,
            "DestroyQueue",
            queue_name=queues.get("destroy_queue_name", f"orchestryx-{env_name}-destroy-lab"),
            visibility_timeout=Duration.minutes(15),
            retention_period=Duration.days(4),
        )

        cdk.CfnOutput(self, "ProvisionQueueUrl", value=self.provision_queue.queue_url)
        cdk.CfnOutput(self, "DestroyQueueUrl", value=self.destroy_queue.queue_url)

