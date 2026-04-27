import os

import aws_cdk as cdk
from orchestryx_infra.orchestryx_infra_stack import LabStack

app = cdk.App()

# Context values passed in via --context flags
# These are set by the Celery worker when deploying a lab
instance_id     = app.node.try_get_context("instance_id") or "test-001"
docker_image    = app.node.try_get_context("docker_image") or "bkimminich/juice-shop:latest"
wg_server_privkey = app.node.try_get_context("wg_server_privkey") or "TEST_PRIVKEY"
wg_client_pubkey  = app.node.try_get_context("wg_client_pubkey") or "TEST_PUBKEY"
flag            = app.node.try_get_context("flag") or "ORCHESTRYX{test_flag}"
instance_type   = app.node.try_get_context("instance_type") or "t3.small"
aws_account = os.getenv("AWS_ACCOUNT_ID") or os.getenv("CDK_DEFAULT_ACCOUNT")
aws_region = os.getenv("AWS_REGION") or os.getenv("CDK_DEFAULT_REGION") or "eu-central-1"

LabStack(
    app,
    f"orchestryx-lab-{instance_id}",
    instance_id=instance_id,
    docker_image=docker_image,
    wg_server_privkey=wg_server_privkey,
    wg_client_pubkey=wg_client_pubkey,
    flag=flag,
    instance_type=instance_type,
    env=cdk.Environment(
        account=aws_account,
        region=aws_region
    )
)

app.synth()
