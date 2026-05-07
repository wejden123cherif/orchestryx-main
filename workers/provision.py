import logging
import subprocess

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from apps.api.config import AWS_REGION, CDK_INFRA_PATH, DATABASE_URL, WG_DNS
from apps.api.models.lab_instance import LabInstance
from apps.api.models.lab_template import LabTemplate
from workers.celery_app import PROVISION_QUEUE, celery_app

logger = logging.getLogger(__name__)

SYNC_DATABASE_URL = DATABASE_URL.replace("+asyncpg", "")
engine = create_engine(
    SYNC_DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def _run_wg_command(args: list[str], input_text: str | None = None) -> str:
    """Run a WireGuard CLI command and return the stripped stdout."""
    try:
        result = subprocess.run(
            args,
            input=input_text,
            text=True,
            capture_output=True,
            check=True,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        logger.exception("WireGuard command failed")
        raise RuntimeError("WireGuard key generation failed") from exc
    return result.stdout.strip()


def _generate_wg_keypair() -> tuple[str, str]:
    """Generate one WireGuard private/public keypair via the wg CLI."""
    private_key = _run_wg_command(["wg", "genkey"])
    public_key = _run_wg_command(["wg", "pubkey"], input_text=f"{private_key}\n")
    return private_key, public_key


def _mark_failed(instance_id: str) -> None:
    """Persist a FAILED status without depending on async FastAPI sessions."""
    try:
        with SessionLocal() as session:
            instance = session.get(LabInstance, instance_id)
            if instance is None:
                logger.error("Lab instance %s not found while marking FAILED", instance_id)
                return

            instance.status = "FAILED"
            session.commit()
    except SQLAlchemyError as exc:
        logger.exception("Database write failed while marking lab FAILED")
        raise RuntimeError("Could not mark lab as failed") from exc


def _get_cfn_output(stack_name: str, output_key: str) -> str:
    """Read a named CloudFormation output from the deployed lab stack."""
    try:
        cfn = boto3.client("cloudformation", region_name=AWS_REGION)
        response = cfn.describe_stacks(StackName=stack_name)
    except (BotoCoreError, ClientError) as exc:
        logger.exception("CloudFormation output lookup failed")
        raise RuntimeError("Could not read CloudFormation outputs") from exc

    try:
        outputs = response["Stacks"][0].get("Outputs", [])
    except (IndexError, KeyError) as exc:
        raise RuntimeError(f"Missing CloudFormation stack data for {stack_name}") from exc

    for output in outputs:
        if output.get("OutputKey") == output_key:
            return output["OutputValue"]

    raise RuntimeError(f"Missing CloudFormation output {output_key} on {stack_name}")


def _store_vpn_config(secret_name: str, vpn_config: str) -> None:
    """Create the Secrets Manager entry that stores the user's VPN config."""
    try:
        secrets = boto3.client("secretsmanager", region_name=AWS_REGION)
        secrets.create_secret(Name=secret_name, SecretString=vpn_config)
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code != "ResourceExistsException":
            logger.exception("Secrets Manager create failed")
            raise RuntimeError("Could not store VPN config") from exc

        # Retries can reach this point after a partial previous attempt.
        logger.info("VPN config secret already exists; writing a new version")
        try:
            secrets.put_secret_value(SecretId=secret_name, SecretString=vpn_config)
        except (BotoCoreError, ClientError) as put_exc:
            logger.exception("Secrets Manager update failed")
            raise RuntimeError("Could not update VPN config") from put_exc
    except BotoCoreError as exc:
        logger.exception("Secrets Manager client operation failed")
        raise RuntimeError("Could not store VPN config") from exc


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
                challenge_port = template.challenge_port
                challenge_path = template.challenge_path
        except SQLAlchemyError as exc:
            raise RuntimeError("Database query failed before provisioning") from exc

        logger.info("Generating WireGuard server and client keypairs")
        server_privkey, server_pubkey = _generate_wg_keypair()
        client_privkey, client_pubkey = _generate_wg_keypair()

        # The current backend schema has no template flag column, so generate a
        # stable per-instance flag while still passing the required CDK context.
        flag = f"ORCHESTRYX{{{instance_id}}}"

        logger.info("Deploying CDK stack %s", stack_name)
        try:
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
                    "--context",
                    f"challenge_port={challenge_port}",
                    "--context",
                    f"challenge_path={challenge_path}",
                ],
                cwd=infra_path,
                timeout=600,
                capture_output=True,
                text=True,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            logger.exception("CDK deploy command could not be started or completed")
            raise RuntimeError("CDK deploy failed") from exc

        if deploy_result.returncode != 0:
            logger.error(
                "CDK deploy failed for %s with return code %s",
                stack_name,
                deploy_result.returncode,
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
DNS = {WG_DNS}

[Peer]
PublicKey = {server_pubkey}
Endpoint = {ec2_ip}:51820
AllowedIPs = 10.8.0.0/24
PersistentKeepalive = 25
"""

        logger.info("Storing VPN config in Secrets Manager")
        _store_vpn_config(secret_name, vpn_config)

        logger.info("Updating lab instance %s to RUNNING", instance_id)
        try:
            with SessionLocal() as session:
                instance = session.get(LabInstance, instance_id)
                if instance is None:
                    raise RuntimeError(f"Lab instance {instance_id} not found")

                instance.status = "RUNNING"
                instance.ec2_public_ip = ec2_ip
                instance.cfn_stack_name = stack_name
                instance.secrets_key = secret_name
                session.commit()
        except SQLAlchemyError as exc:
            raise RuntimeError("Database write failed after provisioning") from exc

        logger.info("Provisioning complete for lab instance %s", instance_id)

    except Exception as exc:
        logger.exception("Provisioning failed for lab instance %s", instance_id)
        try:
            _mark_failed(instance_id)
        except Exception:
            logger.exception("Could not mark lab instance %s as FAILED", instance_id)
        raise self.retry(exc=exc, countdown=30, max_retries=2)
