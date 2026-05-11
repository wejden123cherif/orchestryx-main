from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger(__name__)

from apps.api.config import (
    AWS_REGION,
    AWS_VPC_ID,
    LAB_ECS_ASSIGN_PUBLIC_IP,
    LAB_ECS_CLUSTER,
    LAB_ECS_CPU,
    LAB_ECS_LOG_GROUP,
    LAB_ECS_LOG_STREAM_PREFIX,
    LAB_ECS_MEMORY_MIB,
    LAB_ECS_SECURITY_GROUP_IDS,
    LAB_ECS_SUBNET_IDS,
    LAB_ECS_TASK_EXECUTION_ROLE_ARN,
    LAB_ECS_TASK_ROLE_ARN,
)
from apps.api.models.lab_instance import LabInstance
from apps.api.models.lab_template import LabTemplate


class LabRuntimeConfigError(RuntimeError):
    """Raised when the ECS lab runtime is enabled without required settings."""


class LabRuntimeAwsError(RuntimeError):
    """Raised when AWS rejects or cannot complete a lab runtime operation."""


@dataclass(frozen=True)
class EcsTaskSnapshot:
    task_arn: str
    task_definition_arn: str | None
    last_status: str | None
    desired_status: str | None
    stop_code: str | None
    stopped_reason: str | None
    started_at: datetime | None
    stopped_at: datetime | None
    container_name: str | None
    container_last_status: str | None
    log_stream_name: str | None
    network_interface_id: str | None
    private_ip: str | None
    public_ip: str | None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _required_runtime_settings() -> None:
    missing = []
    if not LAB_ECS_CLUSTER:
        missing.append("LAB_ECS_CLUSTER")
    if not LAB_ECS_SUBNET_IDS:
        missing.append("LAB_ECS_SUBNET_IDS")
    if not LAB_ECS_SECURITY_GROUP_IDS:
        missing.append("LAB_ECS_SECURITY_GROUP_IDS")
    if not LAB_ECS_TASK_EXECUTION_ROLE_ARN:
        missing.append("LAB_ECS_TASK_EXECUTION_ROLE_ARN")
    if not AWS_VPC_ID:
        missing.append("AWS_VPC_ID")
    if missing:
        raise LabRuntimeConfigError(
            "Missing required ECS lab runtime settings: " + ", ".join(missing)
        )


def _ecs_client():
    return boto3.client("ecs", region_name=AWS_REGION)


def _ec2_client():
    return boto3.client("ec2", region_name=AWS_REGION)


def _logs_client():
    return boto3.client("logs", region_name=AWS_REGION)


def _family_name(template_id: str) -> str:
    safe_id = re.sub(r"[^A-Za-z0-9-]", "-", template_id).strip("-").lower()
    return f"orchestryx-lab-{safe_id or 'template'}"


def _container_name(template_id: str) -> str:
    safe_id = re.sub(r"[^A-Za-z0-9-]", "-", template_id).strip("-").lower()
    return f"lab-{safe_id or 'challenge'}"[:64]


def _log_stream_name(container_name: str, task_arn: str) -> str:
    task_id = task_arn.rsplit("/", 1)[-1]
    return f"{LAB_ECS_LOG_STREAM_PREFIX}/{container_name}/{task_id}"


def ensure_lab_log_group() -> None:
    try:
        _logs_client().create_log_group(logGroupName=LAB_ECS_LOG_GROUP)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code != "ResourceAlreadyExistsException":
            raise LabRuntimeAwsError("Could not create lab CloudWatch log group") from exc
    except BotoCoreError as exc:
        raise LabRuntimeAwsError("Could not create lab CloudWatch log group") from exc


def register_lab_task_definition(template: LabTemplate) -> tuple[str, str]:
    _required_runtime_settings()
    ensure_lab_log_group()
    container_name = _container_name(template.id)
    task_definition: dict[str, Any] = {
        "family": _family_name(template.id),
        "requiresCompatibilities": ["FARGATE"],
        "networkMode": "awsvpc",
        "cpu": str(LAB_ECS_CPU),
        "memory": str(LAB_ECS_MEMORY_MIB),
        "executionRoleArn": LAB_ECS_TASK_EXECUTION_ROLE_ARN,
        "runtimePlatform": {
            "cpuArchitecture": "X86_64",
            "operatingSystemFamily": "LINUX",
        },
        "containerDefinitions": [
            {
                "name": container_name,
                "image": template.docker_image_uri,
                "essential": True,
                "portMappings": [
                    {
                        "containerPort": int(template.challenge_port),
                        "protocol": "tcp",
                    }
                ],
                "environment": [],
                "logConfiguration": {
                    "logDriver": "awslogs",
                    "options": {
                        "awslogs-group": LAB_ECS_LOG_GROUP,
                        "awslogs-region": AWS_REGION,
                        "awslogs-stream-prefix": LAB_ECS_LOG_STREAM_PREFIX,
                    },
                },
            }
        ],
    }
    if LAB_ECS_TASK_ROLE_ARN:
        task_definition["taskRoleArn"] = LAB_ECS_TASK_ROLE_ARN

    try:
        response = _ecs_client().register_task_definition(**task_definition)
    except (BotoCoreError, ClientError) as exc:
        raise LabRuntimeAwsError("Could not register lab task definition") from exc

    return response["taskDefinition"]["taskDefinitionArn"], container_name


def run_lab_task(
    *,
    instance: LabInstance,
    template: LabTemplate,
    task_definition_arn: str,
    per_lab_security_group_id: str | None = None,
) -> str:
    _required_runtime_settings()
    container_name = _container_name(template.id)

    # The shared lab SG provides egress-only baseline. The per-lab SG adds
    # the source-specific ingress rule for this lab's owner VPN IP.
    security_groups = [*LAB_ECS_SECURITY_GROUP_IDS]
    if per_lab_security_group_id:
        security_groups.append(per_lab_security_group_id)

    try:
        response = _ecs_client().run_task(
            cluster=LAB_ECS_CLUSTER,
            taskDefinition=task_definition_arn,
            launchType="FARGATE",
            count=1,
            enableECSManagedTags=True,
            propagateTags="TASK_DEFINITION",
            networkConfiguration={
                "awsvpcConfiguration": {
                    "subnets": LAB_ECS_SUBNET_IDS,
                    "securityGroups": security_groups,
                    "assignPublicIp": "ENABLED" if LAB_ECS_ASSIGN_PUBLIC_IP else "DISABLED",
                }
            },
            overrides={
                "containerOverrides": [
                    {
                        "name": container_name,
                        "environment": [
                            {"name": "ORCHESTRYX_INSTANCE_ID", "value": instance.id},
                            {"name": "ORCHESTRYX_TEMPLATE_ID", "value": template.id},
                            {"name": "ORCHESTRYX_USER_ID", "value": instance.user_id},
                            {"name": "ORCHESTRYX_FLAG", "value": f"ORCHESTRYX{{{instance.id}}}"},
                        ],
                    }
                ]
            },
            tags=[
                {"key": "Project", "value": "Orchestryx"},
                {"key": "Runtime", "value": "lab"},
                {"key": "LabInstanceId", "value": instance.id},
                {"key": "LabTemplateId", "value": template.id},
                {"key": "UserId", "value": instance.user_id},
            ],
        )
    except (BotoCoreError, ClientError) as exc:
        raise LabRuntimeAwsError("Could not start ECS lab task") from exc

    failures = response.get("failures", [])
    if failures:
        reason = "; ".join(f"{f.get('arn', 'task')}: {f.get('reason', 'unknown')}" for f in failures)
        raise LabRuntimeAwsError(f"ECS refused to start lab task: {reason}")

    tasks = response.get("tasks", [])
    if not tasks:
        raise LabRuntimeAwsError("ECS did not return a started task")
    return tasks[0]["taskArn"]


def describe_task(task_arn: str) -> EcsTaskSnapshot | None:
    try:
        response = _ecs_client().describe_tasks(cluster=LAB_ECS_CLUSTER, tasks=[task_arn])
    except (BotoCoreError, ClientError) as exc:
        raise LabRuntimeAwsError("Could not describe ECS lab task") from exc

    tasks = response.get("tasks", [])
    if not tasks:
        return None

    task = tasks[0]
    container = (task.get("containers") or [{}])[0]
    attachment_details = {
        detail.get("name"): detail.get("value")
        for attachment in task.get("attachments", [])
        if attachment.get("type") == "ElasticNetworkInterface"
        for detail in attachment.get("details", [])
    }
    eni_id = attachment_details.get("networkInterfaceId")
    private_ip = attachment_details.get("privateIPv4Address")
    public_ip = None
    if eni_id:
        private_ip, public_ip = describe_network_interface(eni_id, private_ip)

    return EcsTaskSnapshot(
        task_arn=task["taskArn"],
        task_definition_arn=task.get("taskDefinitionArn"),
        last_status=task.get("lastStatus"),
        desired_status=task.get("desiredStatus"),
        stop_code=task.get("stopCode"),
        stopped_reason=task.get("stoppedReason"),
        started_at=task.get("startedAt"),
        stopped_at=task.get("stoppedAt"),
        container_name=container.get("name"),
        container_last_status=container.get("lastStatus"),
        log_stream_name=_log_stream_name(container.get("name") or "lab", task["taskArn"]),
        network_interface_id=eni_id,
        private_ip=private_ip,
        public_ip=public_ip,
    )


def describe_network_interface(
    network_interface_id: str,
    fallback_private_ip: str | None = None,
) -> tuple[str | None, str | None]:
    try:
        response = _ec2_client().describe_network_interfaces(
            NetworkInterfaceIds=[network_interface_id]
        )
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") == "InvalidNetworkInterfaceID.NotFound":
            return fallback_private_ip, None
        raise LabRuntimeAwsError("Could not describe lab task network interface") from exc
    except BotoCoreError as exc:
        raise LabRuntimeAwsError("Could not describe lab task network interface") from exc

    interfaces = response.get("NetworkInterfaces", [])
    if not interfaces:
        return fallback_private_ip, None
    interface = interfaces[0]
    private_ip = interface.get("PrivateIpAddress") or fallback_private_ip
    public_ip = interface.get("Association", {}).get("PublicIp")
    return private_ip, public_ip


def stop_lab_task(task_arn: str, reason: str) -> EcsTaskSnapshot | None:
    try:
        _ecs_client().stop_task(cluster=LAB_ECS_CLUSTER, task=task_arn, reason=reason)
    except (BotoCoreError, ClientError) as exc:
        raise LabRuntimeAwsError("Could not stop ECS lab task") from exc
    return describe_task(task_arn)


def apply_task_snapshot(instance: LabInstance, snapshot: EcsTaskSnapshot) -> None:
    instance.ecs_cluster_name = LAB_ECS_CLUSTER
    instance.ecs_task_arn = snapshot.task_arn
    instance.ecs_task_definition_arn = snapshot.task_definition_arn
    instance.ecs_last_status = snapshot.last_status
    instance.ecs_desired_status = snapshot.desired_status
    instance.ecs_container_name = snapshot.container_name
    instance.ecs_log_group = LAB_ECS_LOG_GROUP
    instance.ecs_log_stream_name = snapshot.log_stream_name
    instance.ecs_network_interface_id = snapshot.network_interface_id
    instance.ecs_private_ip = snapshot.private_ip
    instance.ecs_public_ip = snapshot.public_ip
    instance.ecs_stop_reason = snapshot.stopped_reason or snapshot.stop_code
    instance.ecs_started_at = snapshot.started_at
    instance.ecs_stopped_at = snapshot.stopped_at
    instance.runtime_metadata = {
        **(instance.runtime_metadata or {}),
        "container_last_status": snapshot.container_last_status,
        "updated_at": utc_now().isoformat(),
    }


def create_per_lab_security_group(
    instance_id: str,
    source_vpn_ip: str,
    challenge_port: int,
) -> str:
    """Create a dedicated EC2 security group for one lab instance.

    Inbound rule: TCP/{challenge_port} from {source_vpn_ip}/32 only.
    No inbound from the broad VPN subnet or from the WireGuard gateway SG.

    Returns the new security group ID. Raises LabRuntimeAwsError on failure.
    The caller must store the ID and call delete_per_lab_security_group on destroy.
    """
    if not AWS_VPC_ID:
        raise LabRuntimeConfigError("AWS_VPC_ID is required for per-lab security group creation")

    sg_name = f"orchestryx-lab-{instance_id[:8]}"
    try:
        response = _ec2_client().create_security_group(
            GroupName=sg_name,
            Description=f"Per-lab isolation: {instance_id}",
            VpcId=AWS_VPC_ID,
            TagSpecifications=[
                {
                    "ResourceType": "security-group",
                    "Tags": [
                        {"Key": "Project", "Value": "Orchestryx"},
                        {"Key": "LabInstanceId", "Value": instance_id},
                        {"Key": "ManagedBy", "Value": "orchestryx-worker"},
                    ],
                }
            ],
        )
    except (BotoCoreError, ClientError) as exc:
        raise LabRuntimeAwsError("Could not create per-lab security group") from exc

    sg_id = response["GroupId"]

    try:
        _ec2_client().authorize_security_group_ingress(
            GroupId=sg_id,
            IpPermissions=[
                {
                    "IpProtocol": "tcp",
                    "FromPort": challenge_port,
                    "ToPort": challenge_port,
                    "IpRanges": [
                        {
                            "CidrIp": f"{source_vpn_ip}/32",
                            "Description": "Lab owner VPN IP only",
                        }
                    ],
                }
            ],
        )
    except (BotoCoreError, ClientError) as exc:
        # Best-effort cleanup before propagating.
        _try_delete_security_group(sg_id)
        raise LabRuntimeAwsError("Could not configure per-lab security group ingress rule") from exc

    logger.info(
        "Created per-lab SG %s: tcp/%d from %s/32 (instance %s)",
        sg_id,
        challenge_port,
        source_vpn_ip,
        instance_id,
    )
    return sg_id


def _try_delete_security_group(sg_id: str) -> None:
    try:
        _ec2_client().delete_security_group(GroupId=sg_id)
    except Exception:
        logger.warning("Best-effort delete of SG %s failed", sg_id, exc_info=True)


def delete_per_lab_security_group(sg_id: str) -> None:
    """Delete the per-lab security group after the ECS task has stopped.

    Logs on failure rather than raising — lab destroy must not be blocked by
    a stale or already-deleted security group.
    """
    if not sg_id:
        return
    try:
        _ec2_client().delete_security_group(GroupId=sg_id)
        logger.info("Deleted per-lab security group %s", sg_id)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code == "InvalidGroup.NotFound":
            logger.info("Per-lab SG %s already absent; skipping delete", sg_id)
        else:
            logger.warning("Could not delete per-lab SG %s: %s", sg_id, exc)
    except BotoCoreError as exc:
        logger.warning("Could not delete per-lab SG %s: %s", sg_id, exc)


def fetch_lab_logs(
    *,
    log_group: str,
    log_stream_name: str,
    limit: int = 100,
    next_token: str | None = None,
) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "logGroupName": log_group,
        "logStreamName": log_stream_name,
        "limit": max(1, min(limit, 500)),
        "startFromHead": False,
    }
    if next_token:
        kwargs["nextToken"] = next_token
    try:
        response = _logs_client().get_log_events(**kwargs)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in {"ResourceNotFoundException", "InvalidParameterException"}:
            return {"events": [], "next_forward_token": None}
        raise LabRuntimeAwsError("Could not fetch lab logs") from exc
    except BotoCoreError as exc:
        raise LabRuntimeAwsError("Could not fetch lab logs") from exc

    return {
        "events": [
            {
                "timestamp": event.get("timestamp"),
                "ingestion_time": event.get("ingestionTime"),
                "message": event.get("message", ""),
            }
            for event in response.get("events", [])
        ],
        "next_forward_token": response.get("nextForwardToken"),
    }
