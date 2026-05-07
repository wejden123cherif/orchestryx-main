import os

import aws_cdk as cdk
from orchestryx_infra.orchestryx_infra_stack import LabStack

app = cdk.App()


def context_value(name: str, *, default: str | None = None) -> str:
    # Real lab deploys must be explicit. This prevents accidental AWS stacks
    # from being created with fake keys or test container values.
    value = app.node.try_get_context(name)
    if value is None:
        value = default
    if value is None or str(value).strip() == "":
        raise ValueError(f"Missing required CDK context value: {name}")
    return str(value)


# The Celery worker passes these values with cdk --context during provisioning.
# Local template inspection can opt in to harmless placeholders by adding:
#   --context use_dev_defaults=true
use_dev_defaults = str(
    app.node.try_get_context("use_dev_defaults") or "false"
).lower() in {"1", "true", "yes", "on"}
dev_defaults = {
    "instance_id": "test-001",
    "docker_image": "bkimminich/juice-shop:latest",
    "wg_server_privkey": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "wg_client_pubkey": "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",
    "flag": "ORCHESTRYX{test_flag}",
    "instance_type": "t3.small",
    "challenge_port": "3000",
    "challenge_path": "/",
} if use_dev_defaults else {}

instance_id = context_value("instance_id", default=dev_defaults.get("instance_id"))
docker_image = context_value("docker_image", default=dev_defaults.get("docker_image"))
wg_server_privkey = context_value(
    "wg_server_privkey",
    default=dev_defaults.get("wg_server_privkey"),
)
wg_client_pubkey = context_value(
    "wg_client_pubkey",
    default=dev_defaults.get("wg_client_pubkey"),
)
flag = context_value("flag", default=dev_defaults.get("flag"))
instance_type = context_value("instance_type", default=dev_defaults.get("instance_type"))
challenge_port = context_value("challenge_port", default=dev_defaults.get("challenge_port"))
challenge_path = context_value("challenge_path", default=dev_defaults.get("challenge_path"))
aws_account = os.getenv("AWS_ACCOUNT_ID") or os.getenv("CDK_DEFAULT_ACCOUNT")
# Lab AMI support is currently pinned to Frankfurt. We intentionally prefer
# AWS_REGION and this default over CDK_DEFAULT_REGION so a local shell set to
# us-east-1 does not break synth or deploy.
aws_region = (
    app.node.try_get_context("aws_region")
    or os.getenv("AWS_REGION")
    or "eu-central-1"
)

LabStack(
    app,
    f"orchestryx-lab-{instance_id}",
    instance_id=instance_id,
    docker_image=docker_image,
    wg_server_privkey=wg_server_privkey,
    wg_client_pubkey=wg_client_pubkey,
    flag=flag,
    instance_type=instance_type,
    challenge_port=int(challenge_port),
    challenge_path=challenge_path,
    env=cdk.Environment(
        account=aws_account,
        region=aws_region
    )
)

app.synth()
