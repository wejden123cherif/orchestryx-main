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
    AWS_VPC_ID,
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


def _network() -> dict[str, Any]:
    try:
        ec2 = _client("ec2")
        vpc_filters = [{"Name": "tag:Project", "Values": ["orchestryx"]}]
        if AWS_VPC_ID:
            vpc_filters = [{"Name": "vpc-id", "Values": [AWS_VPC_ID]}]
        vpcs = ec2.describe_vpcs(Filters=vpc_filters).get("Vpcs", [])
        if not vpcs and AWS_VPC_ID:
            vpcs = ec2.describe_vpcs(VpcIds=[AWS_VPC_ID]).get("Vpcs", [])
        vpc_ids = [vpc["VpcId"] for vpc in vpcs]

        subnets = []
        security_groups = []
        route_tables = []
        if vpc_ids:
            subnet_resp = ec2.describe_subnets(Filters=[{"Name": "vpc-id", "Values": vpc_ids}])
            subnets = [
                {
                    "id": subnet.get("SubnetId"),
                    "vpc_id": subnet.get("VpcId"),
                    "az": subnet.get("AvailabilityZone"),
                    "cidr": subnet.get("CidrBlock"),
                    "available_ips": subnet.get("AvailableIpAddressCount"),
                    "public_ip_on_launch": subnet.get("MapPublicIpOnLaunch"),
                }
                for subnet in subnet_resp.get("Subnets", [])
            ]

            sg_resp = ec2.describe_security_groups(Filters=[{"Name": "vpc-id", "Values": vpc_ids}])
            security_groups = [
                {
                    "id": group.get("GroupId"),
                    "name": group.get("GroupName"),
                    "description": group.get("Description"),
                    "vpc_id": group.get("VpcId"),
                    "ingress_rules": len(group.get("IpPermissions", [])),
                    "egress_rules": len(group.get("IpPermissionsEgress", [])),
                }
                for group in sg_resp.get("SecurityGroups", [])
                if "orchestryx" in group.get("GroupName", "").lower()
                or "orchestryx" in group.get("Description", "").lower()
            ]

            rt_resp = ec2.describe_route_tables(Filters=[{"Name": "vpc-id", "Values": vpc_ids}])
            route_tables = [
                {
                    "id": table.get("RouteTableId"),
                    "vpc_id": table.get("VpcId"),
                    "routes": len(table.get("Routes", [])),
                    "associations": len(table.get("Associations", [])),
                }
                for table in rt_resp.get("RouteTables", [])
            ]

        return {
            "vpcs": [
                {
                    "id": vpc.get("VpcId"),
                    "cidr": vpc.get("CidrBlock"),
                    "state": vpc.get("State"),
                    "is_default": vpc.get("IsDefault"),
                }
                for vpc in vpcs
            ],
            "subnets": subnets,
            "security_groups": security_groups,
            "route_tables": route_tables,
        }
    except (BotoCoreError, ClientError) as exc:
        return {"vpcs": [], "subnets": [], "security_groups": [], "route_tables": [], **_error("Network unavailable", exc)}


def _load_balancing() -> dict[str, Any]:
    try:
        elbv2 = _client("elbv2")
        lbs = [
            {
                "name": lb.get("LoadBalancerName"),
                "arn": lb.get("LoadBalancerArn"),
                "dns_name": lb.get("DNSName"),
                "type": lb.get("Type"),
                "scheme": lb.get("Scheme"),
                "state": lb.get("State", {}).get("Code"),
                "vpc_id": lb.get("VpcId"),
                "azs": [az.get("ZoneName") for az in lb.get("AvailabilityZones", [])],
            }
            for lb in elbv2.describe_load_balancers().get("LoadBalancers", [])
            if "orchestryx" in lb.get("LoadBalancerName", "").lower()
        ]
        target_groups = [
            {
                "name": tg.get("TargetGroupName"),
                "arn": tg.get("TargetGroupArn"),
                "protocol": tg.get("Protocol"),
                "port": tg.get("Port"),
                "target_type": tg.get("TargetType"),
                "vpc_id": tg.get("VpcId"),
                "health_check_path": tg.get("HealthCheckPath"),
            }
            for tg in elbv2.describe_target_groups().get("TargetGroups", [])
            if "orchestryx" in tg.get("TargetGroupName", "").lower()
        ]
        health = []
        for tg in target_groups[:10]:
            arn = tg.get("arn")
            if not arn:
                continue
            target_health = elbv2.describe_target_health(TargetGroupArn=arn).get("TargetHealthDescriptions", [])
            health.append(
                {
                    "target_group": tg["name"],
                    "healthy": sum(1 for item in target_health if item.get("TargetHealth", {}).get("State") == "healthy"),
                    "unhealthy": sum(1 for item in target_health if item.get("TargetHealth", {}).get("State") != "healthy"),
                }
            )
        return {"load_balancers": lbs, "target_groups": target_groups, "target_health": health}
    except (BotoCoreError, ClientError) as exc:
        return {"load_balancers": [], "target_groups": [], "target_health": [], **_error("Load balancing unavailable", exc)}


def _autoscaling() -> dict[str, Any]:
    try:
        autoscaling = _client("autoscaling")
        groups = [
            {
                "name": group.get("AutoScalingGroupName"),
                "desired": group.get("DesiredCapacity"),
                "min": group.get("MinSize"),
                "max": group.get("MaxSize"),
                "instances": len(group.get("Instances", [])),
                "azs": group.get("AvailabilityZones", []),
                "created_at": _utc(group.get("CreatedTime")),
            }
            for group in autoscaling.describe_auto_scaling_groups().get("AutoScalingGroups", [])
            if "orchestryx" in group.get("AutoScalingGroupName", "").lower()
        ]
        appscaling = _client("application-autoscaling")
        scalable_targets = appscaling.describe_scalable_targets(ServiceNamespace="ecs").get("ScalableTargets", [])
        ecs_targets = [
            {
                "resource_id": target.get("ResourceId"),
                "dimension": target.get("ScalableDimension"),
                "min": target.get("MinCapacity"),
                "max": target.get("MaxCapacity"),
            }
            for target in scalable_targets
            if "orchestryx" in target.get("ResourceId", "").lower()
        ]
        return {"groups": groups, "ecs_scaling_targets": ecs_targets}
    except (BotoCoreError, ClientError) as exc:
        return {"groups": [], "ecs_scaling_targets": [], **_error("Autoscaling unavailable", exc)}


def _secrets() -> dict[str, Any]:
    try:
        secrets = _client("secretsmanager")
        paginator = secrets.get_paginator("list_secrets")
        items = []
        for page in paginator.paginate(Filters=[{"Key": "name", "Values": ["orchestryx"]}]):
            for secret in page.get("SecretList", []):
                items.append(
                    {
                        "name": secret.get("Name"),
                        "arn": secret.get("ARN"),
                        "last_changed_at": _utc(secret.get("LastChangedDate")),
                        "last_accessed_at": _utc(secret.get("LastAccessedDate")),
                        "rotation_enabled": secret.get("RotationEnabled", False),
                        "deleted_at": _utc(secret.get("DeletedDate")),
                    }
                )
            if len(items) >= 50:
                break
        return {"items": items[:50], "count": len(items)}
    except (BotoCoreError, ClientError) as exc:
        return {"items": [], "count": 0, **_error("Secrets unavailable", exc)}


def _iam() -> dict[str, Any]:
    try:
        iam = boto3.client("iam")
        paginator = iam.get_paginator("list_roles")
        roles = []
        for page in paginator.paginate():
            for role in page.get("Roles", []):
                role_name = role.get("RoleName", "")
                if "orchestryx" not in role_name.lower():
                    continue
                attached = iam.list_attached_role_policies(RoleName=role_name).get("AttachedPolicies", [])
                roles.append(
                    {
                        "name": role_name,
                        "arn": role.get("Arn"),
                        "created_at": _utc(role.get("CreateDate")),
                        "attached_policies": len(attached),
                        "max_session_duration": role.get("MaxSessionDuration"),
                    }
                )
            if len(roles) >= 30:
                break
        return {"roles": roles[:30]}
    except (BotoCoreError, ClientError) as exc:
        return {"roles": [], **_error("IAM unavailable", exc)}


def _ecs_metrics() -> dict[str, Any]:
    end = datetime.now(timezone.utc)
    start = end - timedelta(minutes=30)
    try:
        cloudwatch = _client("cloudwatch")
        metrics = {}
        for service_name, key in [(AWS_API_SERVICE, "api"), (AWS_WORKER_SERVICE, "worker")]:
            for metric_name in ["CPUUtilization", "MemoryUtilization"]:
                response = cloudwatch.get_metric_statistics(
                    Namespace="AWS/ECS",
                    MetricName=metric_name,
                    Dimensions=[
                        {"Name": "ClusterName", "Value": AWS_ECS_CLUSTER},
                        {"Name": "ServiceName", "Value": service_name},
                    ],
                    StartTime=start,
                    EndTime=end,
                    Period=300,
                    Statistics=["Average", "Maximum"],
                )
                datapoints = response.get("Datapoints", [])
                latest = sorted(datapoints, key=lambda item: item.get("Timestamp", datetime.min.replace(tzinfo=timezone.utc)))[-1] if datapoints else {}
                metrics.setdefault(key, {})[metric_name] = {
                    "average": round(latest.get("Average", 0), 2) if latest else None,
                    "maximum": round(latest.get("Maximum", 0), 2) if latest else None,
                    "timestamp": _utc(latest.get("Timestamp")) if latest else None,
                }
        return metrics
    except (BotoCoreError, ClientError) as exc:
        return {"status": "ERROR", "error": f"ECS metrics unavailable: {exc.__class__.__name__}"}


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
        "network": _network(),
        "load_balancing": _load_balancing(),
        "autoscaling": _autoscaling(),
        "secrets": _secrets(),
        "iam": _iam(),
        "metrics": {"ecs": _ecs_metrics()},
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
