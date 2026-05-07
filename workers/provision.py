import logging
import subprocess

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from apps.api.config import (
    AWS_REGION,
    CDK_INFRA_PATH,
    DATABASE_URL,
    LAB_PROVISION_TIMEOUT_SECONDS,
    LAB_STARTUP_RETRY_SECONDS,
    WG_DNS,
)
from apps.api.models.credit_transaction import CreditTransaction
from apps.api.models.lab_instance import LabInstance
from apps.api.models.lab_template import LabTemplate
from apps.api.models.user import User
from apps.api.services.lab_lifecycle import (
    LAB_STATUS_FAILED,
    LAB_STATUS_PROVISIONING,
    LAB_STATUS_QUEUED,
    LAB_STATUS_READY,
    LAB_STATUS_STARTING,
    set_lab_status,
)
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


def _update_instance_status(
    instance_id: str,
    *,
    status: str,
    message: str,
    progress: int,
    level: str = "info",
    phase: str | None = None,
) -> None:
    try:
        with SessionLocal() as session:
            instance = session.get(LabInstance, instance_id)
            if instance is None:
                logger.error("Lab instance %s not found while updating status", instance_id)
                return
            set_lab_status(
                session,
                instance,
                status=status,
                message=message,
                progress=progress,
                level=level,
                phase=phase,
            )
            session.commit()
    except SQLAlchemyError as exc:
        logger.exception("Database write failed while updating lab status")
        raise RuntimeError("Could not update lab status") from exc


def _mark_failed(instance_id: str, user_id: str, template_id: str, reason: str) -> None:
    """Persist final FAILED status and refund credits once."""
    try:
        with SessionLocal() as session:
            instance = session.get(LabInstance, instance_id)
            if instance is None:
                logger.error("Lab instance %s not found while marking FAILED", instance_id)
                return

            already_failed = instance.status == LAB_STATUS_FAILED
            template = session.get(LabTemplate, template_id)

            set_lab_status(
                session,
                instance,
                status=LAB_STATUS_FAILED,
                message="Provisioning failed. Credits were refunded.",
                progress=100,
                level="error",
                phase="failed",
                failure_reason=reason[:2000],
            )

            if not already_failed and template is not None:
                user = session.get(User, user_id)
                if user is not None:
                    user.credits_balance += float(template.credits_cost)
                session.add(
                    CreditTransaction(
                        user_id=user_id,
                        delta=float(template.credits_cost),
                        reason=f"Refund: provisioning failed for {template_id} ({instance_id})",
                    )
                )
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


def _wait_for_instance_status_ok(ec2_instance_id: str) -> None:
    """Wait for EC2 and system checks before presenting the lab as ready."""
    try:
        ec2 = boto3.client("ec2", region_name=AWS_REGION)
        waiter = ec2.get_waiter("instance_status_ok")
        max_attempts = max(1, LAB_PROVISION_TIMEOUT_SECONDS // 15)
        waiter.wait(
            InstanceIds=[ec2_instance_id],
            WaiterConfig={"Delay": 15, "MaxAttempts": max_attempts},
        )
    except (BotoCoreError, ClientError) as exc:
        logger.exception("EC2 readiness wait failed")
        raise RuntimeError("EC2 instance did not become ready") from exc


def _best_effort_destroy(stack_name: str) -> None:
    """Clean up a partially-created stack after final provisioning failure."""
    try:
        cfn = boto3.client("cloudformation", region_name=AWS_REGION)
        cfn.delete_stack(StackName=stack_name)
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code == "ValidationError":
            logger.info("No CloudFormation stack to clean up for %s", stack_name)
            return
        logger.exception("Best-effort CloudFormation cleanup failed for stack %s", stack_name)
    except BotoCoreError:
        logger.exception("Best-effort cleanup failed for stack %s", stack_name)


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
        _update_instance_status(
            instance_id,
            status=LAB_STATUS_PROVISIONING,
            message="Provisioning worker picked up the job.",
            progress=12,
            phase="worker-started",
        )
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
                instance.cfn_stack_name = stack_name
                session.commit()
        except SQLAlchemyError as exc:
            raise RuntimeError("Database query failed before provisioning") from exc

        _update_instance_status(
            instance_id,
            status=LAB_STATUS_PROVISIONING,
            message="Generating WireGuard keys.",
            progress=20,
            phase="wireguard",
        )
        logger.info("Generating WireGuard server and client keypairs")
        server_privkey, server_pubkey = _generate_wg_keypair()
        client_privkey, client_pubkey = _generate_wg_keypair()

        # The current backend schema has no template flag column, so generate a
        # stable per-instance flag while still passing the required CDK context.
        flag = f"ORCHESTRYX{{{instance_id}}}"

        _update_instance_status(
            instance_id,
            status=LAB_STATUS_PROVISIONING,
            message="Creating lab infrastructure in AWS.",
            progress=35,
            phase="cloudformation",
        )
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
                timeout=LAB_PROVISION_TIMEOUT_SECONDS,
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
            raise RuntimeError(deploy_result.stderr[-2000:] or "CDK deploy failed")

        _update_instance_status(
            instance_id,
            status=LAB_STATUS_STARTING,
            message="CloudFormation finished; waiting for the lab host to pass health checks.",
            progress=72,
            phase="instance-starting",
        )
        logger.info("Reading CloudFormation outputs for %s", stack_name)
        ec2_ip = _get_cfn_output(stack_name, "EC2PublicIP")
        ec2_instance_id = _get_cfn_output(stack_name, "EC2InstanceId")
        logger.info("CDK stack %s deployed EC2 instance %s", stack_name, ec2_instance_id)

        _wait_for_instance_status_ok(ec2_instance_id)

        _update_instance_status(
            instance_id,
            status=LAB_STATUS_STARTING,
            message="Instance checks passed; storing VPN access configuration.",
            progress=88,
            phase="vpn-config",
        )
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

        logger.info("Updating lab instance %s to READY", instance_id)
        try:
            with SessionLocal() as session:
                instance = session.get(LabInstance, instance_id)
                if instance is None:
                    raise RuntimeError(f"Lab instance {instance_id} not found")

                instance.ec2_public_ip = ec2_ip
                instance.cfn_stack_name = stack_name
                instance.secrets_key = secret_name
                set_lab_status(
                    session,
                    instance,
                    status=LAB_STATUS_READY,
                    message="Lab is ready. Download VPN config to connect.",
                    progress=100,
                    phase="ready",
                )
                session.commit()
        except SQLAlchemyError as exc:
            raise RuntimeError("Database write failed after provisioning") from exc

        logger.info("Provisioning complete for lab instance %s", instance_id)

    except Exception as exc:
        logger.exception("Provisioning failed for lab instance %s", instance_id)
        if self.request.retries >= self.max_retries:
            _best_effort_destroy(stack_name)
            try:
                _mark_failed(instance_id, user_id, template_id, str(exc))
            except Exception:
                logger.exception("Could not mark lab instance %s as FAILED", instance_id)
            return

        try:
            with SessionLocal() as session:
                instance = session.get(LabInstance, instance_id)
                if instance is not None:
                    instance.retry_count = self.request.retries + 1
                    set_lab_status(
                        session,
                        instance,
                        status=LAB_STATUS_QUEUED,
                        message="Provisioning attempt failed; retrying shortly.",
                        progress=10,
                        level="warning",
                        phase="retry",
                    )
                    session.commit()
        except SQLAlchemyError:
            logger.exception("Could not persist retry status for lab %s", instance_id)

        raise self.retry(exc=exc, countdown=LAB_STARTUP_RETRY_SECONDS, max_retries=2)
