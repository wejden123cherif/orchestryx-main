"""Export selected CDK outputs to a dotenv file for app/runtime wiring."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from config_loader import load_config


OUTPUT_MAP = {
    "NetworkStack": {
        "VpcId": "ORCHESTRYX_VPC_ID",
        "PrivateSubnetIds": "ORCHESTRYX_PRIVATE_SUBNET_IDS",
    },
    "EcrStack": {
        "ApiRepositoryUri": "ORCHESTRYX_API_ECR_REPO_URI",
        "WorkerRepositoryUri": "ORCHESTRYX_WORKER_ECR_REPO_URI",
    },
    "EcsPlatformStack": {
        "EcsClusterName": "ORCHESTRYX_ECS_CLUSTER_NAME",
        "ApiServiceName": "ORCHESTRYX_API_SERVICE_NAME",
        "WorkerServiceName": "ORCHESTRYX_WORKER_SERVICE_NAME",
        "ApiSecurityGroupId": "ORCHESTRYX_API_SG_ID",
        "MigrationTaskDefinitionArn": "ORCHESTRYX_MIGRATION_TASK_ARN",
        "ApiLoadBalancerDnsName": "ORCHESTRYX_API_ALB_DNS",
        "ApiBaseUrl": "ORCHESTRYX_API_BASE_URL",
    },
    "DatabaseStack": {
        "DatabaseEndpoint": "ORCHESTRYX_DATABASE_ENDPOINT",
        "DatabaseSecretArn": "ORCHESTRYX_DATABASE_SECRET_ARN",
    },
    "QueuesStack": {
        "ProvisionQueueUrl": "ORCHESTRYX_PROVISION_QUEUE_URL",
        "DestroyQueueUrl": "ORCHESTRYX_DESTROY_QUEUE_URL",
    },
    "AuthStack": {
        "CognitoUserPoolId": "ORCHESTRYX_COGNITO_USER_POOL_ID",
        "CognitoUserPoolClientId": "ORCHESTRYX_COGNITO_CLIENT_ID",
    },
    "DnsStack": {
        "PrivateHostedZoneId": "ORCHESTRYX_PRIVATE_ZONE_ID",
    },
}


def _infer_region(outputs: dict) -> str:
    for stack_outputs in outputs.values():
        for value in stack_outputs.values():
            value = str(value)
            if ".dkr.ecr." in value:
                return value.split(".dkr.ecr.", 1)[1].split(".", 1)[0]
            if value.startswith("https://sqs."):
                return value.split("https://sqs.", 1)[1].split(".", 1)[0]
            if value.startswith("arn:aws:"):
                parts = value.split(":")
                if len(parts) > 3 and parts[3]:
                    return parts[3]
    return ""


def _infer_account_id(outputs: dict) -> str:
    for stack_outputs in outputs.values():
        for value in stack_outputs.values():
            value = str(value)
            if ".dkr.ecr." in value:
                return value.split(".dkr.ecr.", 1)[0]
            if value.startswith("https://sqs."):
                parts = value.split("/")
                if len(parts) > 3:
                    return parts[3]
            if value.startswith("arn:aws:"):
                parts = value.split(":")
                if len(parts) > 4 and parts[4]:
                    return parts[4]
    return ""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", default="dev", help="Config environment name")
    parser.add_argument(
        "--outputs-file",
        default="cdk-outputs-dev.json",
        help="Path to CDK outputs JSON produced by cdk deploy --outputs-file",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Dotenv output path. Defaults to .env.<env>.generated in repo root.",
    )
    args = parser.parse_args()

    app_dir = Path(__file__).resolve().parent
    repo_root = app_dir.parents[1]
    config = load_config(args.env)
    outputs_path = Path(args.outputs_file)
    if not outputs_path.is_absolute():
        outputs_path = app_dir / outputs_path
    dotenv_path = Path(args.output) if args.output else repo_root / f".env.{args.env}.generated"

    try:
        outputs = json.loads(outputs_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(
            f"Error: CDK outputs file not found: {outputs_path}\n\n"
            "Generate it by deploying with --outputs-file:\n"
            f"  cd infra/platform_cdk\n"
            f"  cdk deploy OrchestryxDev-DatabaseStack -c env={args.env} "
            f"--outputs-file {args.outputs_file}\n\n"
            "To capture all stack outputs at once (only after images are pushed):\n"
            f"  cdk deploy --all -c env={args.env} --outputs-file {args.outputs_file}",
            file=sys.stderr,
        )
        sys.exit(1)
    stack_prefix = config.get("naming", {}).get("stack_name_prefix", f"Orchestryx{args.env.title()}")
    region = config.get("aws", {}).get("region", "")
    if not region:
        region = _infer_region(outputs)
    account_id = config.get("aws", {}).get("account", "")
    if not account_id:
        account_id = _infer_account_id(outputs)

    values: dict[str, str] = {
        "ORCHESTRYX_ENV": args.env,
        "AWS_REGION": region,
        "AWS_ACCOUNT_ID": account_id,
        "ORCHESTRYX_ECS_CLUSTER_NAME": config.get("ecs", {}).get("cluster_name", ""),
    }

    for stack_suffix, mapping in OUTPUT_MAP.items():
        stack_outputs = outputs.get(f"{stack_prefix}-{stack_suffix}", {})
        for output_name, env_name in mapping.items():
            if output_name in stack_outputs:
                values[env_name] = str(stack_outputs[output_name])

    ecs_config = config.get("ecs", {})
    ecr_config = config.get("ecr", {})
    if "ORCHESTRYX_API_SERVICE_NAME" not in values:
        values["ORCHESTRYX_API_SERVICE_NAME"] = ecs_config.get(
            "api_service_name", f"orchestryx-{args.env}-api-service"
        )
    if "ORCHESTRYX_WORKER_SERVICE_NAME" not in values:
        values["ORCHESTRYX_WORKER_SERVICE_NAME"] = ecs_config.get(
            "worker_service_name", f"orchestryx-{args.env}-worker-service"
        )
    if account_id and region and "ORCHESTRYX_API_ECR_REPO_URI" not in values:
        values["ORCHESTRYX_API_ECR_REPO_URI"] = (
            f"{account_id}.dkr.ecr.{region}.amazonaws.com/"
            f"{ecr_config.get('api_repository_name', f'orchestryx-{args.env}-api')}"
        )
    if account_id and region and "ORCHESTRYX_WORKER_ECR_REPO_URI" not in values:
        values["ORCHESTRYX_WORKER_ECR_REPO_URI"] = (
            f"{account_id}.dkr.ecr.{region}.amazonaws.com/"
            f"{ecr_config.get('worker_repository_name', f'orchestryx-{args.env}-worker')}"
        )

    dotenv_path.write_text(
        "\n".join(f"{key}={value}" for key, value in values.items()) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {dotenv_path}")


if __name__ == "__main__":
    main()
