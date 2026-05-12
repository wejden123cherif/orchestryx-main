from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

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


def _console_url(service: str, fragment: str = "", region: str = AWS_REGION) -> str:
    base_region = "" if service == "iam" else f"?region={region}"
    return f"https://{region}.console.aws.amazon.com/{service}/home{base_region}{fragment}"


def _ec2_url(fragment: str) -> str:
    return _console_url("ec2", fragment)


def _tag_map(tags: list[dict[str, Any]] | None) -> dict[str, str]:
    return {str(tag.get("Key")): str(tag.get("Value")) for tag in tags or [] if tag.get("Key")}


def _hours_since(value: datetime | None) -> float | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return round((datetime.now(timezone.utc) - value.astimezone(timezone.utc)).total_seconds() / 3600, 2)


def _estimate_instance_hourly_cost(instance_type: str | None) -> float | None:
    rates = {
        "t3.nano": 0.0052,
        "t3.micro": 0.0104,
        "t3.small": 0.0208,
        "t3.medium": 0.0416,
        "t3.large": 0.0832,
        "t4g.nano": 0.0042,
        "t4g.micro": 0.0084,
        "t4g.small": 0.0168,
        "t4g.medium": 0.0336,
    }
    if not instance_type:
        return None
    return rates.get(instance_type)


def _ecs_service(service_name: str) -> dict[str, Any]:
    try:
        ecs = _client("ecs")
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


def _ecs_tasks() -> list[dict[str, Any]]:
    try:
        ecs = _client("ecs")
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
            "console_url": _console_url("sqs", f"#/queues/{quote(url, safe='')}"),
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
            "console_url": _console_url("ecr", f"#/repositories/private/{repository_name}"),
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
            "console_url": _console_url("cloudwatch", f"#logsV2:log-groups/log-group/{quote(name, safe='')}"),
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
                if stack.get("StackName", "").startswith(
                    ("OrchestryxDev-", "OrchestryxStaging-", "OrchestryxProd-")
                ):
                    stacks.append(
                        {
                            "name": stack.get("StackName"),
                            "status": stack.get("StackStatus"),
                            "created_at": _utc(stack.get("CreationTime")),
                            "updated_at": _utc(stack.get("LastUpdatedTime")),
                            "console_url": _console_url("cloudformation", f"#/stacks?filteringText={quote(stack.get('StackName', ''), safe='')}"),
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
                tags = _tag_map(instance.get("Tags"))
                security_groups = [
                    {"id": group.get("GroupId"), "name": group.get("GroupName")}
                    for group in instance.get("SecurityGroups", [])
                ]
                volume_ids = [
                    mapping.get("Ebs", {}).get("VolumeId")
                    for mapping in instance.get("BlockDeviceMappings", [])
                    if mapping.get("Ebs", {}).get("VolumeId")
                ]
                hourly = _estimate_instance_hourly_cost(instance.get("InstanceType"))
                uptime_hours = _hours_since(instance.get("LaunchTime"))
                instances.append(
                    {
                        "id": instance.get("InstanceId"),
                        "name": tags.get("Name", instance.get("InstanceId")),
                        "lab_instance_id": tags.get("InstanceId"),
                        "stack_name": tags.get("aws:cloudformation:stack-name") or tags.get("StackName"),
                        "managed_by": tags.get("ManagedBy"),
                        "state": instance.get("State", {}).get("Name"),
                        "type": instance.get("InstanceType"),
                        "image_id": instance.get("ImageId"),
                        "public_ip": instance.get("PublicIpAddress"),
                        "private_ip": instance.get("PrivateIpAddress"),
                        "az": instance.get("Placement", {}).get("AvailabilityZone"),
                        "vpc_id": instance.get("VpcId"),
                        "subnet_id": instance.get("SubnetId"),
                        "security_groups": security_groups,
                        "iam_instance_profile": instance.get("IamInstanceProfile", {}).get("Arn"),
                        "volume_ids": volume_ids,
                        "tags": tags,
                        "launched_at": _utc(instance.get("LaunchTime")),
                        "uptime_hours": uptime_hours,
                        "estimated_hourly_cost": hourly,
                        "estimated_running_cost": round(hourly * uptime_hours, 2) if hourly and uptime_hours else None,
                        "console_url": _ec2_url(f"#InstanceDetails:instanceId={instance.get('InstanceId')}"),
                    }
                )
        return instances
    except (BotoCoreError, ClientError) as exc:
        return [{"status": "ERROR", "error": f"EC2 unavailable: {exc.__class__.__name__}"}]


def _rule_targets(permission: dict[str, Any]) -> list[dict[str, str]]:
    targets: list[dict[str, str]] = []
    for item in permission.get("IpRanges", []):
        targets.append({"type": "ipv4", "value": item.get("CidrIp", ""), "description": item.get("Description", "")})
    for item in permission.get("Ipv6Ranges", []):
        targets.append({"type": "ipv6", "value": item.get("CidrIpv6", ""), "description": item.get("Description", "")})
    for item in permission.get("PrefixListIds", []):
        targets.append({"type": "prefix-list", "value": item.get("PrefixListId", ""), "description": item.get("Description", "")})
    for item in permission.get("UserIdGroupPairs", []):
        targets.append({"type": "security-group", "value": item.get("GroupId", ""), "description": item.get("Description", "")})
    return [target for target in targets if target["value"]]


def _port_label(permission: dict[str, Any]) -> str:
    protocol = permission.get("IpProtocol", "-1")
    if protocol == "-1":
        return "all"
    from_port = permission.get("FromPort")
    to_port = permission.get("ToPort")
    if from_port is None and to_port is None:
        return "all"
    return str(from_port) if from_port == to_port else f"{from_port}-{to_port}"


def _security_rule(direction: str, permission: dict[str, Any], attached_count: int) -> dict[str, Any]:
    protocol = permission.get("IpProtocol", "-1")
    from_port = permission.get("FromPort")
    to_port = permission.get("ToPort")
    targets = _rule_targets(permission)
    public_targets = {target["value"] for target in targets if target["value"] in {"0.0.0.0/0", "::/0"}}
    admin_ports = {22, 3389, 5900, 2375, 2376, 5432, 3306, 6379, 8000, 8080, 8443}
    reasons: list[str] = []

    if direction == "ingress" and public_targets:
        if protocol == "-1":
            reasons.append("Public inbound access to all protocols.")
        elif from_port is not None and to_port is not None and any(from_port <= port <= to_port for port in admin_ports):
            reasons.append("Public inbound access includes an administrative or database port.")
        elif from_port == 0 and to_port == 65535:
            reasons.append("Public inbound access spans every TCP/UDP port.")

    if direction == "egress" and public_targets and protocol == "-1":
        reasons.append("Allows all outbound traffic to the public internet.")

    if attached_count == 0:
        reasons.append("Security group is not attached to any network interface.")

    risk = "high" if any("Public inbound" in reason for reason in reasons) else "medium" if reasons else "low"
    return {
        "direction": direction,
        "protocol": protocol,
        "ports": _port_label(permission),
        "from_port": from_port,
        "to_port": to_port,
        "targets": targets,
        "risk": risk,
        "explanation": " ".join(reasons) if reasons else "Scoped rule with no obvious public exposure.",
    }


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
                    "console_url": _ec2_url(f"#SubnetDetails:subnetId={subnet.get('SubnetId')}"),
                }
                for subnet in subnet_resp.get("Subnets", [])
            ]

            sg_resp = ec2.describe_security_groups(Filters=[{"Name": "vpc-id", "Values": vpc_ids}])
            network_interfaces = ec2.describe_network_interfaces(
                Filters=[{"Name": "vpc-id", "Values": vpc_ids}]
            ).get("NetworkInterfaces", [])
            sg_attachments: dict[str, list[dict[str, Any]]] = {}
            for interface in network_interfaces:
                attachment = interface.get("Attachment", {})
                for group in interface.get("Groups", []):
                    sg_attachments.setdefault(group.get("GroupId", ""), []).append(
                        {
                            "network_interface_id": interface.get("NetworkInterfaceId"),
                            "instance_id": attachment.get("InstanceId"),
                            "private_ip": interface.get("PrivateIpAddress"),
                            "status": interface.get("Status"),
                            "description": interface.get("Description"),
                        }
                    )

            security_groups = []
            for group in sg_resp.get("SecurityGroups", []):
                tags = _tag_map(group.get("Tags"))
                is_relevant = (
                    "orchestryx" in group.get("GroupName", "").lower()
                    or "orchestryx" in group.get("Description", "").lower()
                    or tags.get("Project") == "orchestryx"
                    or tags.get("ManagedBy", "").startswith("orchestryx")
                )
                if not is_relevant:
                    continue

                attachments = sg_attachments.get(group.get("GroupId", ""), [])
                ingress = [
                    _security_rule("ingress", permission, len(attachments))
                    for permission in group.get("IpPermissions", [])
                ]
                egress = [
                    _security_rule("egress", permission, len(attachments))
                    for permission in group.get("IpPermissionsEgress", [])
                ]
                rules = [*ingress, *egress]
                risk_score = sum(3 if rule["risk"] == "high" else 1 if rule["risk"] == "medium" else 0 for rule in rules)
                security_groups.append(
                    {
                        "id": group.get("GroupId"),
                        "name": group.get("GroupName"),
                        "description": group.get("Description"),
                        "vpc_id": group.get("VpcId"),
                        "owner_id": group.get("OwnerId"),
                        "ingress_rules": len(ingress),
                        "egress_rules": len(egress),
                        "rules": rules,
                        "attachments": attachments,
                        "attached_count": len(attachments),
                        "tags": tags,
                        "risk_score": risk_score,
                        "risk_level": "high" if risk_score >= 3 else "medium" if risk_score > 0 else "low",
                        "console_url": _ec2_url(f"#SecurityGroup:groupId={group.get('GroupId')}"),
                    }
                )

            rt_resp = ec2.describe_route_tables(Filters=[{"Name": "vpc-id", "Values": vpc_ids}])
            route_tables = [
                {
                    "id": table.get("RouteTableId"),
                    "vpc_id": table.get("VpcId"),
                    "routes": len(table.get("Routes", [])),
                    "associations": len(table.get("Associations", [])),
                    "console_url": _ec2_url(f"#RouteTableDetails:RouteTableId={table.get('RouteTableId')}"),
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
                    "console_url": _ec2_url(f"#VpcDetails:VpcId={vpc.get('VpcId')}"),
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
                "security_groups": lb.get("SecurityGroups", []),
                "console_url": _ec2_url(f"#LoadBalancer:loadBalancerArn={quote(lb.get('LoadBalancerArn', ''), safe='')}"),
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
                "health_check_protocol": tg.get("HealthCheckProtocol"),
                "console_url": _ec2_url(f"#TargetGroup:targetGroupArn={quote(tg.get('TargetGroupArn', ''), safe='')}"),
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
                        "console_url": _console_url("secretsmanager", f"#!/secret?name={quote(secret.get('Name', ''), safe='')}"),
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
                inline_names = iam.list_role_policies(RoleName=role_name).get("PolicyNames", [])
                roles.append(
                    {
                        "name": role_name,
                        "arn": role.get("Arn"),
                        "created_at": _utc(role.get("CreateDate")),
                        "attached_policies": len(attached),
                        "attached_policy_names": [policy.get("PolicyName") for policy in attached],
                        "inline_policies": len(inline_names),
                        "inline_policy_names": inline_names,
                        "max_session_duration": role.get("MaxSessionDuration"),
                        "last_used_at": _utc(role.get("RoleLastUsed", {}).get("LastUsedDate")),
                        "console_url": f"https://console.aws.amazon.com/iam/home#/roles/details/{quote(role_name, safe='')}",
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
        for group in (response.get("ResultsByTime") or [{}])[0].get("Groups", []):
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
    _tasks: dict[str, tuple] = {
        "ecs_api": (_ecs_service, (AWS_API_SERVICE,)),
        "ecs_worker": (_ecs_service, (AWS_WORKER_SERVICE,)),
        "ecs_tasks": (_ecs_tasks, ()),
        "sqs_provision": (_queue, (PROVISION_QUEUE,)),
        "sqs_destroy": (_queue, (DESTROY_QUEUE,)),
        "aurora": (_aurora, ()),
        "cognito": (_cognito, ()),
        "ecr_api": (_ecr_image, (AWS_ECR_API_REPOSITORY,)),
        "ecr_worker": (_ecr_image, (AWS_ECR_WORKER_REPOSITORY,)),
        "log_api": (_log_group, (AWS_API_LOG_GROUP,)),
        "log_worker": (_log_group, (AWS_WORKER_LOG_GROUP,)),
        "stacks": (_lab_stacks, ()),
        "instances": (_lab_instances, ()),
        "network": (_network, ()),
        "load_balancing": (_load_balancing, ()),
        "autoscaling": (_autoscaling, ()),
        "secrets": (_secrets, ()),
        "iam": (_iam, ()),
        "metrics": (_ecs_metrics, ()),
        "alarms": (_alarms, ()),
        "costs": (_costs, ()),
    }

    results: dict[str, Any] = {}
    with ThreadPoolExecutor(max_workers=len(_tasks)) as pool:
        futures = {pool.submit(fn, *args): key for key, (fn, args) in _tasks.items()}
        for future in as_completed(futures):
            key = futures[future]
            try:
                results[key] = future.result()
            except Exception as exc:
                results[key] = {"status": "ERROR", "error": str(exc)}

    return {
        "region": AWS_REGION,
        "cluster": AWS_ECS_CLUSTER,
        "ecs": {
            "api": results["ecs_api"],
            "worker": results["ecs_worker"],
            "tasks": results["ecs_tasks"],
        },
        "sqs": {
            "provision": results["sqs_provision"],
            "destroy": results["sqs_destroy"],
        },
        "aurora": results["aurora"],
        "cognito": results["cognito"],
        "ecr": {
            "api": results["ecr_api"],
            "worker": results["ecr_worker"],
        },
        "logs": {
            "api": results["log_api"],
            "worker": results["log_worker"],
        },
        "cloudformation": {"lab_stacks": results["stacks"]},
        "ec2": {"lab_instances": results["instances"]},
        "network": results["network"],
        "load_balancing": results["load_balancing"],
        "autoscaling": results["autoscaling"],
        "secrets": results["secrets"],
        "iam": results["iam"],
        "metrics": {"ecs": results["metrics"]},
        "alarms": results["alarms"],
        "costs": results["costs"],
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
