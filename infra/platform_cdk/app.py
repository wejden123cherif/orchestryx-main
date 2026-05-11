"""CDK entry point for long-lived Orchestryx platform infrastructure."""

from __future__ import annotations

import os
import sys
from pathlib import Path

_APP_DIR = Path(__file__).resolve().parent
_APP_DIR_TEXT = str(_APP_DIR)

# The required local `constructs/` directory would otherwise shadow the PyPI
# `constructs` package that aws-cdk-lib imports. Load CDK first with this app
# directory off sys.path, then add the app and local constructs directories for
# first-party imports.
if _APP_DIR_TEXT in sys.path:
    sys.path.remove(_APP_DIR_TEXT)

import aws_cdk as cdk

sys.path.insert(0, _APP_DIR_TEXT)
sys.path.insert(0, str(_APP_DIR / "constructs"))

from config_loader import load_config
from stacks.auth_stack import AuthStack
from stacks.database_stack import DatabaseStack
from stacks.dns_stack import DnsStack
from stacks.ecr_stack import EcrStack
from stacks.ecs_platform_stack import EcsPlatformStack
from stacks.network_stack import NetworkStack
from stacks.observability_stack import ObservabilityStack
from stacks.queues_stack import QueuesStack
from stacks.vpn_stack import VpnStack


app = cdk.App()
env_name = str(app.node.try_get_context("env") or os.getenv("ORCHESTRYX_ENV") or "dev")
config = load_config(env_name)

account = str(config.get("aws", {}).get("account") or os.getenv("CDK_DEFAULT_ACCOUNT") or "")
region = str(config.get("aws", {}).get("region") or os.getenv("CDK_DEFAULT_REGION") or "")
stack_env = cdk.Environment(account=account or None, region=region or None)

tags = {
    "Project": "Orchestryx",
    "Environment": env_name,
    "ManagedBy": "platform-cdk",
}


def stack_id(name: str) -> str:
    stack_prefix = config.get("naming", {}).get(
        "stack_name_prefix", f"Orchestryx{env_name.title()}"
    )
    stack_names = {
        "network": "NetworkStack",
        "ecr": "EcrStack",
        "queues": "QueuesStack",
        "auth": "AuthStack",
        "observability": "ObservabilityStack",
        "database": "DatabaseStack",
        "ecs": "EcsPlatformStack",
        "dns": "DnsStack",
        "vpn": "VpnStack",
    }
    return f"{stack_prefix}-{stack_names[name]}"


network = NetworkStack(
    app,
    stack_id("network"),
    config=config,
    env_name=env_name,
    env=stack_env,
)

ecr = EcrStack(app, stack_id("ecr"), config=config, env_name=env_name, env=stack_env)

queues = QueuesStack(
    app,
    stack_id("queues"),
    config=config,
    env_name=env_name,
    env=stack_env,
)

auth = AuthStack(app, stack_id("auth"), config=config, env_name=env_name, env=stack_env)

observability = ObservabilityStack(
    app,
    stack_id("observability"),
    config=config,
    env_name=env_name,
    env=stack_env,
)

database = DatabaseStack(
    app,
    stack_id("database"),
    config=config,
    env_name=env_name,
    vpc=network.vpc,
    env=stack_env,
)

dns = DnsStack(
    app,
    stack_id("dns"),
    config=config,
    env_name=env_name,
    vpc=network.vpc,
    env=stack_env,
)

vpn = VpnStack(
    app,
    stack_id("vpn"),
    config=config,
    env_name=env_name,
    vpc=network.vpc,
    private_hosted_zone=dns.private_hosted_zone,
    env=stack_env,
)

ecs_platform = EcsPlatformStack(
    app,
    stack_id("ecs"),
    config=config,
    env_name=env_name,
    vpc=network.vpc,
    api_repository=ecr.api_repository,
    worker_repository=ecr.worker_repository,
    provision_queue=queues.provision_queue,
    destroy_queue=queues.destroy_queue,
    user_pool=auth.user_pool,
    user_pool_client=auth.user_pool_client,
    database_security_group_id=database.database_security_group.security_group_id,
    api_log_group=observability.api_log_group,
    worker_log_group=observability.worker_log_group,
    lab_log_group=observability.lab_log_group,
    database_endpoint=database.database_endpoint,
    vpn_security_group=vpn.gateway_security_group,
    env=stack_env,
)

for key, value in tags.items():
    cdk.Tags.of(app).add(key, value)

app.synth()
