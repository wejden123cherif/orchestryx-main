import logging
import subprocess

import boto3
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import AWS_REGION, CDK_INFRA_PATH, DATABASE_URL
from app.models.lab_instance import LabInstance
from app.models.lab_template import LabTemplate
from app.workers.celery_app import PROVISION_QUEUE, celery_app

logger = logging.getLogger(__name__)

SYNC_DATABASE_URL = DATABASE_URL.replace("+asyncpg", "")
engine = create_engine(SYNC_DATABASE_URL)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def _run_wg_command(args: list[str], input_text: str | None = None) -> str:
    """Run a WireGuard CLI command and return the stripped stdout."""
    result = subprocess.run(
        args,
        input=input_text,
        text=True,
        capture_output=True,
        check=True,
    )
    return result.stdout.strip()


def _generate_wg_keypair() -> tuple[str, str]:
    """Generate one WireGuard private/public keypair via the wg CLI."""
    private_key = _run_wg_command(["wg", "genkey"])
    public_key = _run_wg_command(["wg", "pubkey"], input_text=f"{private_key}\n")
    return private_key, public_key


def _mark_failed(instance_id: str) -> None:
    """Persist a FAILED status without depending on async FastAPI sessions."""
    with SessionLocal() as session:
        instance = session.get(LabInstance, instance_id)
        if instance is None:
            logger.error("Lab instance %s not found while marking FAILED", instance_id)
            return

        instance.status = "FAILED"
        session.commit()


def _get_cfn_output(stack_name: str, output_key: str) -> str:
    """Read a named CloudFormation output from the deployed lab stack."""
    cfn = boto3.client("cloudformation", region_name=AWS_REGION)
    response = cfn.describe_stacks(StackName=stack_name)
    outputs = response["Stacks"][0].get("Outputs", [])

    for output in outputs:
        if output.get("OutputKey") == output_key:
            return output["OutputValue"]

    raise RuntimeError(f"Missing CloudFormation output {output_key} on {stack_name}")


def _store_vpn_config(secret_name: str, vpn_config: str) -> None:
    """Create the Secrets Manager entry that stores the user's VPN config."""
    secrets = boto3.client("secretsmanager", region_name=AWS_REGION)
    try:
        secrets.create_secret(Name=secret_name, SecretString=vpn_config)
    except secrets.exceptions.ResourceExistsException:
        # Retries can reach this point after a partial previous attempt.
        logger.info("Secret %s already exists; writing a new version", secret_name)
        secrets.put_secret_value(SecretId=secret_name, SecretString=vpn_config)


@celery_app.task(queue=PROVISION_QUEUE, bind=True, max_retries=2)
def provision_lab(self, instance_id: str, template_id: str, user_id: str):
    """
    Provision one lab by deploying its CDK stack and storing its VPN config.

    Celery workers are synchronous, so this task creates its own sync SQLAlchemy
    session instead of reusing the app's async FastAPI session dependency.
    """
    stack_name = f"orchestryx-lab-{instance_id}"
    secret_name = f"orchestryx/lab/{instance_id}/vpn"
    infra_path = CDK_INFRA_PATH

    logger.info("Starting provisioning for lab instance %s for user %s", instance_id, user_id)

    try:
        with SessionLocal() as session:
            logger.info("Loading template %s for lab instance %s", template_id, instance_id)
            template = session.get(LabTemplate, template_id)
            if template is None:
                raise RuntimeError(f"Lab template {template_id} not found")

            instance = session.get(LabInstance, instance_id)
            if instance is None:
                raise RuntimeError(f"Lab instance {instance_id} not found")

            docker_image = template.docker_image_uri
            instance_type = template.instance_type

        logger.info("Generating WireGuard server and client keypairs")
        server_privkey, server_pubkey = _generate_wg_keypair()
        client_privkey, client_pubkey = _generate_wg_keypair()

        # The current backend schema has no template flag column, so generate a
        # stable per-instance flag while still passing the required CDK context.
        flag = f"ORCHESTRYX{{{instance_id}}}"

        logger.info("Deploying CDK stack %s from %s", stack_name, infra_path)
        deploy_result = subprocess.run(
            [
                "cdk",
                "deploy",
                stack_name,
                "--require-approval",
                "never",
                "--context",
                f"instance_id={instance_id}",
                "--context",
                f"docker_image={docker_image}",
                "--context",
                f"wg_server_privkey={server_privkey}",
                "--context",
                f"wg_client_pubkey={client_pubkey}",
                "--context",
                f"flag={flag}",
                "--context",
                f"instance_type={instance_type}",
            ],
            cwd=infra_path,
            timeout=600,
            capture_output=True,
            text=True,
        )

        if deploy_result.returncode != 0:
            logger.error(
                "CDK deploy failed for %s with return code %s: %s",
                stack_name,
                deploy_result.returncode,
                deploy_result.stderr,
            )
            _mark_failed(instance_id)
            return

        logger.info("Reading CloudFormation outputs for %s", stack_name)
        ec2_ip = _get_cfn_output(stack_name, "EC2PublicIP")
        ec2_instance_id = _get_cfn_output(stack_name, "EC2InstanceId")
        logger.info("CDK stack %s deployed EC2 instance %s", stack_name, ec2_instance_id)

        logger.info("Building WireGuard client config for lab instance %s", instance_id)
        vpn_config = f"""[Interface]
PrivateKey = {client_privkey}
Address = 10.8.0.2/24
DNS = 8.8.8.8

[Peer]
PublicKey = {server_pubkey}
Endpoint = {ec2_ip}:51820
AllowedIPs = 10.8.0.0/24
PersistentKeepalive = 25
"""

        logger.info("Storing VPN config in Secrets Manager at %s", secret_name)
        _store_vpn_config(secret_name, vpn_config)

        logger.info("Updating lab instance %s to RUNNING", instance_id)
        with SessionLocal() as session:
            instance = session.get(LabInstance, instance_id)
            if instance is None:
                raise RuntimeError(f"Lab instance {instance_id} not found")

            instance.status = "RUNNING"
            instance.ec2_public_ip = ec2_ip
            instance.cfn_stack_name = stack_name
            instance.secrets_key = secret_name
            session.commit()

        logger.info("Provisioning complete for lab instance %s", instance_id)

    except Exception as exc:
        logger.exception("Provisioning failed for lab instance %s", instance_id)
        try:
            _mark_failed(instance_id)
        except Exception:
            logger.exception("Could not mark lab instance %s as FAILED", instance_id)
        raise self.retry(exc=exc, countdown=30, max_retries=2)
