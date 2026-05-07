from datetime import datetime, timedelta, timezone
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from apps.api.config import (
    AWS_API_LOG_GROUP,
    AWS_API_SERVICE,
    AWS_AURORA_CLUSTER,
    AWS_COGNITO_POOL_ID,
    AWS_ECR_API_REPOSITORY,
    AWS_ECR_WORKER_REPOSITORY,
    AWS_ECS_CLUSTER,
    AWS_REGION,
    AWS_WORKER_LOG_GROUP,
    AWS_WORKER_SERVICE,
    DESTROY_QUEUE,
    PROVISION_QUEUE,
)


def _client(service: str, region: str = AWS_REGION):
    return boto3.client(service, region_name=region)


def _utc(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).isoformat()


def _error(message: str, exc: Exception) -> dict[str, Any]:
    return {
        "status": "ERROR",
        "error": f"{message}: {exc.__class__.__name__}",
    }


def _ecs_service(ecs, service_name: str) -> dict[str, Any]:
    try:
        response = ecs.describe_services(cluster=AWS_ECS_CLUSTER, services=[service_name])
        failures = response.get("failures", [])
        if failures:
            return {"name": service_name, "status": "MISSING", "failures": failures}

        service = response["services"][0]
        deployments = service.get("deployments", [])
        primary = next((item for item in deployments if item.get("status") == "PRIMARY"), deployments[0] if deployments else {})
        return {
            "name": service_name,
            "status": service.get("status", "UNKNOWN"),
            "desired": service.get("desiredCount", 0),
            "running": service.get("runningCount", 0),
            "pending": service.get("pendingCount", 0),
            "task_definition": service.get("taskDefinition", "").split("/")[-1],
            "rollout_state": primary.get("rolloutState"),
            "updated_at": _utc(primary.get("updatedAt")),
            "events": [
                {
                    "created_at": _utc(event.get("createdAt")),
                    "message": event.get("message", ""),
                }
                for event in service.get("events", [])[:6]
            ],
        }
    except (BotoCoreError, ClientError, KeyError, IndexError) as exc:
        return {"name": service_name, **_error("ECS service unavailable", exc)}


def _ecs_tasks(ecs) -> list[dict[str, Any]]:
    try:
        task_arns: list[str] = []
        for service_name in [AWS_API_SERVICE, AWS_WORKER_SERVICE]:
            task_arns.extend(
                ecs.list_tasks(cluster=AWS_ECS_CLUSTER, serviceName=service_name).get("taskArns", [])
            )
        if not task_arns:
            return []
        response = ecs.describe_tasks(cluster=AWS_ECS_CLUSTER, tasks=task_arns)
        tasks = []
        for task in response.get("tasks", []):
            private_ip = None
            for attachment in task.get("attachments", []):
                for detail in attachment.get("details", []):
                    if detail.get("name") == "privateIPv4Address":
                        private_ip = detail.get("value")
            group = task.get("group", "")
            tasks.append(
                {
                    "id": task.get("taskArn", "").split("/")[-1],
                    "service": "api" if AWS_API_SERVICE in group else "worker",
                    "last_status": task.get("lastStatus"),
                    "desired_status": task.get("desiredStatus"),
                    "cpu": task.get("cpu"),
                    "memory": task.get("memory"),
                    "private_ip": private_ip,
                    "started_at": _utc(task.get("startedAt")),
                    "task_definition": task.get("taskDefinitionArn", "").split("/")[-1],
                }
            )
        return tasks
    except (BotoCoreError, ClientError) as exc:
        return [{"status": "ERROR", "error": f"ECS tasks unavailable: {exc.__class__.__name__}"}]


def _queue(name: str) -> dict[str, Any]:
    try:
        sqs = _client("sqs")
        url = sqs.get_queue_url(QueueName=name)["QueueUrl"]
        attrs = sqs.get_queue_attributes(
            QueueUrl=url,
            AttributeNames=[
                "ApproximateNumberOfMessages",
                "ApproximateNumberOfMessagesNotVisible",
                "ApproximateAgeOfOldestMessage",
            ],
        )["Attributes"]
        return {
            "name": name,
            "url": url,
            "queued": int(attrs.get("ApproximateNumberOfMessages", 0)),
            "in_flight": int(attrs.get("ApproximateNumberOfMessagesNotVisible", 0)),
            "oldest_age_seconds": int(attrs.get("ApproximateAgeOfOldestMessage", 0)),
        }
    except (BotoCoreError, ClientError, KeyError) as exc:
        return {"name": name, **_error("SQS queue unavailable", exc)}


def _aurora() -> dict[str, Any]:
    try:
        response = _client("rds").describe_db_clusters(DBClusterIdentifier=AWS_AURORA_CLUSTER)
        cluster = response["DBClusters"][0]
        return {
            "id": cluster.get("DBClusterIdentifier"),
            "status": cluster.get("Status"),
            "engine": cluster.get("Engine"),
            "engine_version": cluster.get("EngineVersion"),
            "endpoint": cluster.get("Endpoint"),
            "reader_endpoint": cluster.get("ReaderEndpoint"),
            "multi_az": len(cluster.get("AvailabilityZones", [])) > 1,
            "azs": cluster.get("AvailabilityZones", []),
        }
    except (BotoCoreError, ClientError, KeyError, IndexError) as exc:
        return {"id": AWS_AURORA_CLUSTER, **_error("Aurora cluster unavailable", exc)}


def _cognito() -> dict[str, Any]:
    try:
        pool = _client("cognito-idp").describe_user_pool(UserPoolId=AWS_COGNITO_POOL_ID)["UserPool"]
        return {
            "id": AWS_COGNITO_POOL_ID,
            "name": pool.get("Name"),
            "status": pool.get("Status", "ACTIVE"),
            "estimated_users": pool.get("EstimatedNumberOfUsers", 0),
            "mfa": pool.get("MfaConfiguration", "OFF"),
            "created_at": _utc(pool.get("CreationDate")),
        }
    except (BotoCoreError, ClientError, KeyError) as exc:
        return {"id": AWS_COGNITO_POOL_ID, **_error("Cognito pool unavailable", exc)}


def _ecr_image(repository_name: str) -> dict[str, Any]:
    try:
        ecr = _client("ecr")
        images = ecr.describe_images(
            repositoryName=repository_name,
            filter={"tagStatus": "TAGGED"},
        ).get("imageDetails", [])
        if not images:
            return {"repository": repository_name, "status": "EMPTY"}
        latest = sorted(
            images,
            key=lambda item: item.get("imagePushedAt", datetime.min.replace(tzinfo=timezone.utc)),
            reverse=True,
        )[0]
        return {
            "repository": repository_name,
            "status": "OK",
            "pushed_at": _utc(latest.get("imagePushedAt")),
            "size_mb": round(latest.get("imageSizeInBytes", 0) / 1_048_576, 1),
            "digest": latest.get("imageDigest"),
            "tags": latest.get("imageTags", []),
        }
    except (BotoCoreError, ClientError) as exc:
        return {"repository": repository_name, **_error("ECR image unavailable", exc)}


def _log_group(name: str) -> dict[str, Any]:
    try:
        logs = _client("logs")
        groups = logs.describe_log_groups(logGroupNamePrefix=name).get("logGroups", [])
        match = next((group for group in groups if group.get("logGroupName") == name), {})
        streams = logs.describe_log_streams(
            logGroupName=name,
            orderBy="LastEventTime",
            descending=True,
            limit=1,
        ).get("logStreams", [])
        latest = streams[0] if streams else {}
        latest_ts = latest.get("lastEventTimestamp")
        latest_at = (
            datetime.fromtimestamp(latest_ts / 1000, tz=timezone.utc).isoformat()
            if latest_ts
            else None
        )
        return {
            "name": name,
            "stored_mb": round(match.get("storedBytes", 0) / 1_048_576, 2),
            "retention_days": match.get("retentionInDays"),
            "latest_stream": latest.get("logStreamName"),
            "latest_event_at": latest_at,
        }
    except (BotoCoreError, ClientError) as exc:
        return {"name": name, **_error("CloudWatch logs unavailable", exc)}


def _lab_stacks() -> list[dict[str, Any]]:
    try:
        cfn = _client("cloudformation")
        paginator = cfn.get_paginator("list_stacks")
        statuses = [
            "CREATE_IN_PROGRESS",
            "CREATE_COMPLETE",
            "UPDATE_IN_PROGRESS",
            "UPDATE_COMPLETE",
            "ROLLBACK_IN_PROGRESS",
            "ROLLBACK_COMPLETE",
            "DELETE_IN_PROGRESS",
        ]
        stacks = []
        for page in paginator.paginate(StackStatusFilter=statuses):
            for stack in page.get("StackSummaries", []):
                if stack.get("StackName", "").startswith("orchestryx-lab-"):
                    stacks.append(
                        {
                            "name": stack.get("StackName"),
                            "status": stack.get("StackStatus"),
                            "created_at": _utc(stack.get("CreationTime")),
                            "updated_at": _utc(stack.get("LastUpdatedTime")),
                        }
                    )
        return sorted(stacks, key=lambda item: item.get("created_at") or "", reverse=True)
    except (BotoCoreError, ClientError) as exc:
        return [{"status": "ERROR", "error": f"CloudFormation unavailable: {exc.__class__.__name__}"}]


def _lab_instances() -> list[dict[str, Any]]:
    try:
        ec2 = _client("ec2")
        response = ec2.describe_instances(
            Filters=[
                {"Name": "tag:Project", "Values": ["orchestryx"]},
                {"Name": "tag:ManagedBy", "Values": ["orchestryx-cdk"]},
                {"Name": "instance-state-name", "Values": ["pending", "running", "stopping", "stopped"]},
            ]
        )
        instances = []
        for reservation in response.get("Reservations", []):
            for instance in reservation.get("Instances", []):
                tags = {tag["Key"]: tag["Value"] for tag in instance.get("Tags", [])}
                instances.append(
                    {
                        "id": instance.get("InstanceId"),
                        "name": tags.get("Name", instance.get("InstanceId")),
                        "lab_instance_id": tags.get("InstanceId"),
                        "state": instance.get("State", {}).get("Name"),
                        "type": instance.get("InstanceType"),
                        "public_ip": instance.get("PublicIpAddress"),
                        "private_ip": instance.get("PrivateIpAddress"),
                        "az": instance.get("Placement", {}).get("AvailabilityZone"),
                        "launched_at": _utc(instance.get("LaunchTime")),
                    }
                )
        return instances
    except (BotoCoreError, ClientError) as exc:
        return [{"status": "ERROR", "error": f"EC2 unavailable: {exc.__class__.__name__}"}]


def _alarms() -> dict[str, Any]:
    try:
        response = _client("cloudwatch").describe_alarms(StateValue="ALARM")
        alarms = [
            {
                "name": alarm.get("AlarmName"),
                "state": alarm.get("StateValue"),
                "metric": alarm.get("MetricName"),
                "namespace": alarm.get("Namespace"),
                "reason": alarm.get("StateReason", "")[:240],
                "updated_at": _utc(alarm.get("StateUpdatedTimestamp")),
            }
            for alarm in response.get("MetricAlarms", [])
        ]
        return {"firing": len(alarms), "alarms": alarms}
    except (BotoCoreError, ClientError) as exc:
        return {"firing": 0, "alarms": [], **_error("CloudWatch alarms unavailable", exc)}


def _costs() -> dict[str, Any]:
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=30)
    try:
        ce = boto3.client("ce", region_name="us-east-1")
        response = ce.get_cost_and_usage(
            TimePeriod={"Start": start.isoformat(), "End": end.isoformat()},
            Granularity="MONTHLY",
            Metrics=["UnblendedCost"],
            GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}],
        )
        services = []
        total = 0.0
        for group in response.get("ResultsByTime", [{}])[0].get("Groups", []):
            amount = float(group["Metrics"]["UnblendedCost"]["Amount"])
            if amount <= 0:
                continue
            total += amount
            services.append({"service": group["Keys"][0], "amount": round(amount, 2)})
        return {
            "status": "LIVE",
            "period": f"{start.isoformat()} to {end.isoformat()}",
            "total": round(total, 2),
            "currency": "USD",
            "services": sorted(services, key=lambda item: item["amount"], reverse=True)[:8],
        }
    except (BotoCoreError, ClientError) as exc:
        return {
            "status": "UNAVAILABLE",
            "period": f"{start.isoformat()} to {end.isoformat()}",
            "total": 0,
            "currency": "USD",
            "services": [],
            "error": f"Cost Explorer unavailable: {exc.__class__.__name__}",
        }


def get_aws_overview() -> dict[str, Any]:
    ecs = _client("ecs")
    return {
        "region": AWS_REGION,
        "cluster": AWS_ECS_CLUSTER,
        "ecs": {
            "api": _ecs_service(ecs, AWS_API_SERVICE),
            "worker": _ecs_service(ecs, AWS_WORKER_SERVICE),
            "tasks": _ecs_tasks(ecs),
        },
        "sqs": {
            "provision": _queue(PROVISION_QUEUE),
            "destroy": _queue(DESTROY_QUEUE),
        },
        "aurora": _aurora(),
        "cognito": _cognito(),
        "ecr": {
            "api": _ecr_image(AWS_ECR_API_REPOSITORY),
            "worker": _ecr_image(AWS_ECR_WORKER_REPOSITORY),
        },
        "logs": {
            "api": _log_group(AWS_API_LOG_GROUP),
            "worker": _log_group(AWS_WORKER_LOG_GROUP),
        },
        "cloudformation": {"lab_stacks": _lab_stacks()},
        "ec2": {"lab_instances": _lab_instances()},
        "alarms": _alarms(),
        "costs": _costs(),
    }


def get_recent_logs(service: str) -> str:
    if service == "api":
        log_group = AWS_API_LOG_GROUP
    elif service == "worker":
        log_group = AWS_WORKER_LOG_GROUP
    else:
        raise ValueError("service must be api or worker")

    try:
        logs = _client("logs")
        streams = logs.describe_log_streams(
            logGroupName=log_group,
            orderBy="LastEventTime",
            descending=True,
            limit=3,
        ).get("logStreams", [])
        lines: list[str] = []
        for stream in streams:
            events = logs.get_log_events(
                logGroupName=log_group,
                logStreamName=stream["logStreamName"],
                limit=50,
                startFromHead=False,
            ).get("events", [])
            for event in events:
                ts = datetime.fromtimestamp(event["timestamp"] / 1000, tz=timezone.utc)
                lines.append(f"{ts.isoformat()}  {event['message'].rstrip()}")
            if len(lines) >= 80:
                break
        return "\n".join(lines[-80:]) or "No log events found."
    except (BotoCoreError, ClientError) as exc:
        return f"Could not fetch {service} logs: {exc.__class__.__name__}"
