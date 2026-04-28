import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import boto3
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse

REGION = "eu-central-1"
CLUSTER = "orchestryx"
API_SERVICE = "orchestryx-api-service"
WORKER_SERVICE = "orchestryx-worker-service"
ECR_API = "254076817005.dkr.ecr.eu-central-1.amazonaws.com/orchestryx-api"
ECR_WORKER = "254076817005.dkr.ecr.eu-central-1.amazonaws.com/orchestryx-worker"
LOG_GROUP_API = "/ecs/orchestryx-api"
LOG_GROUP_WORKER = "/ecs/orchestryx-worker"
AURORA_CLUSTER = "orchestryx-db"
SQS_PROVISION = "orchestryx-provision-lab"
SQS_DESTROY = "orchestryx-destroy-lab"
COGNITO_POOL = "eu-central-1_FCduBIpFa"
ACCOUNT_ID = "254076817005"
VPC_ID = "vpc-0d10f5a5902d4ffd4"
API_SG = "sg-0205b75f583ebfa25"
WORKER_SG = "sg-0db089ffb994e8272"
AURORA_SG = "sg-0088ffc271e2fa353"
SUBNETS = ["subnet-09b0a64b46e90bf03", "subnet-0f3460c06ddf5ecc9", "subnet-0ff556deb9702ca2a"]
SECRET_ARN = "arn:aws:secretsmanager:eu-central-1:254076817005:secret:orchestryx/api/env-J7WB6D"

app = FastAPI(title="Orchestryx Cockpit")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR = Path(__file__).parent / "static"


def boto(service: str):
    return boto3.client(service, region_name=REGION)


def utc(dt: datetime | None) -> str:
    if not dt:
        return "—"
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


# ── helpers ──────────────────────────────────────────────────────────────────

def get_ecs_service(ecs, service_name: str) -> dict:
    try:
        resp = ecs.describe_services(cluster=CLUSTER, services=[service_name])
        svc = resp["services"][0]
        return {
            "name": service_name,
            "desired": svc["desiredCount"],
            "running": svc["runningCount"],
            "pending": svc["pendingCount"],
            "status": svc["status"],
            "task_definition": svc.get("taskDefinition", "").split("/")[-1],
            "launch_type": svc.get("launchType", "FARGATE"),
            "created": utc(svc.get("createdAt")),
            "updated": utc(svc.get("deployments", [{}])[0].get("updatedAt")),
            "deployments": [
                {
                    "id": d.get("id", "").replace("ecs-svc/", "")[:12],
                    "status": d.get("status", "UNKNOWN"),
                    "rollout": d.get("rolloutState", "—"),
                    "running": d.get("runningCount", 0),
                    "pending": d.get("pendingCount", 0),
                    "desired": d.get("desiredCount", 0),
                    "task_definition": d.get("taskDefinition", "").split("/")[-1],
                    "updated": utc(d.get("updatedAt")),
                }
                for d in svc.get("deployments", [])
            ],
            "events": [
                {"time": utc(e.get("createdAt")), "message": e.get("message", "")}
                for e in svc.get("events", [])[:8]
            ],
        }
    except Exception:
        return {"name": service_name, "desired": 0, "running": 0, "pending": 0, "status": "ERROR", "deployments": [], "events": []}


def get_tasks(ecs) -> list[dict]:
    try:
        task_arns = []
        for svc in [API_SERVICE, WORKER_SERVICE]:
            resp = ecs.list_tasks(cluster=CLUSTER, serviceName=svc)
            task_arns.extend(resp.get("taskArns", []))
        if not task_arns:
            return []
        details = ecs.describe_tasks(cluster=CLUSTER, tasks=task_arns)
        tasks = []
        for t in details["tasks"]:
            svc_tag = "api" if API_SERVICE in (t.get("group") or "") else "worker"
            ip = ""
            for att in t.get("attachments", []):
                for detail in att.get("details", []):
                    if detail.get("name") == "privateIPv4Address":
                        ip = detail["value"]
            started = t.get("startedAt")
            tasks.append({
                "id": t["taskArn"].split("/")[-1][:8],
                "arn": t["taskArn"],
                "service": svc_tag,
                "status": t.get("lastStatus", "UNKNOWN"),
                "desired": t.get("desiredStatus", "UNKNOWN"),
                "cpu": t.get("cpu", "—"),
                "memory": t.get("memory", "—"),
                "ip": ip,
                "started": utc(started),
                "task_definition": t.get("taskDefinitionArn", "").split("/")[-1],
            })
        return tasks
    except Exception:
        return []


def get_aurora() -> dict:
    try:
        rds = boto("rds")
        resp = rds.describe_db_clusters(DBClusterIdentifier=AURORA_CLUSTER)
        c = resp["DBClusters"][0]
        return {
            "id": c.get("DBClusterIdentifier", AURORA_CLUSTER),
            "status": c["Status"],
            "engine": c.get("Engine", "aurora-postgresql"),
            "version": c.get("EngineVersion", "—"),
            "endpoint": c.get("Endpoint", "—"),
            "reader_endpoint": c.get("ReaderEndpoint", "—"),
            "multi_az": len(c.get("AvailabilityZones", [])) > 1,
            "azs": c.get("AvailabilityZones", []),
        }
    except Exception:
        return {"id": AURORA_CLUSTER, "status": "ERROR", "endpoint": "—", "azs": []}


def get_sqs_queue(sqs, name: str) -> dict:
    try:
        url = sqs.get_queue_url(QueueName=name)["QueueUrl"]
        attrs = sqs.get_queue_attributes(
            QueueUrl=url,
            AttributeNames=["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"],
        )["Attributes"]
        return {
            "name": name,
            "url": url,
            "messages": int(attrs.get("ApproximateNumberOfMessages", 0)),
            "in_flight": int(attrs.get("ApproximateNumberOfMessagesNotVisible", 0)),
        }
    except Exception:
        return {"name": name, "messages": -1, "in_flight": -1}


def get_cognito_pool() -> dict:
    try:
        idp = boto("cognito-idp")
        pool = idp.describe_user_pool(UserPoolId=COGNITO_POOL)["UserPool"]
        return {
            "id": COGNITO_POOL,
            "name": pool.get("Name", "—"),
            "users": pool.get("EstimatedNumberOfUsers", 0),
            "status": pool.get("Status", "ACTIVE"),
            "created": utc(pool.get("CreationDate")),
            "mfa": pool.get("MfaConfiguration", "OFF"),
        }
    except Exception:
        return {"id": COGNITO_POOL, "name": "—", "users": -1, "status": "ERROR"}


def get_ecr_image(repo: str) -> dict:
    try:
        ecr = boto("ecr")
        images = ecr.describe_images(
            repositoryName=repo.split("/")[-1],
            filter={"tagStatus": "TAGGED"},
        )["imageDetails"]
        if not images:
            return {"pushed": "—", "size_mb": 0}
        latest = sorted(images, key=lambda x: x.get("imagePushedAt", datetime.min), reverse=True)[0]
        pushed = latest.get("imagePushedAt")
        size = latest.get("imageSizeInBytes", 0)
        return {
            "repo": repo.split("/")[-1],
            "uri": repo,
            "pushed": pushed.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M") if pushed else "—",
            "size_mb": round(size / 1_048_576),
            "digest": latest.get("imageDigest", "—")[:24],
            "tags": latest.get("imageTags", []),
        }
    except Exception:
        return {"repo": repo.split("/")[-1], "uri": repo, "pushed": "—", "size_mb": 0, "tags": []}


def get_log_group(log_group: str) -> dict:
    try:
        logs_client = boto("logs")
        groups = logs_client.describe_log_groups(logGroupNamePrefix=log_group).get("logGroups", [])
        match = next((g for g in groups if g.get("logGroupName") == log_group), {})
        streams = logs_client.describe_log_streams(
            logGroupName=log_group,
            orderBy="LastEventTime",
            descending=True,
            limit=1,
        ).get("logStreams", [])
        return {
            "name": log_group,
            "stored_mb": round(match.get("storedBytes", 0) / 1_048_576, 2),
            "retention_days": match.get("retentionInDays", "Never expire"),
            "latest_stream": streams[0].get("logStreamName", "—") if streams else "—",
            "latest_event": utc(datetime.fromtimestamp(streams[0]["lastEventTimestamp"] / 1000, tz=timezone.utc)) if streams and streams[0].get("lastEventTimestamp") else "—",
        }
    except Exception:
        return {"name": log_group, "stored_mb": 0, "retention_days": "—", "latest_stream": "—", "latest_event": "—"}


def get_stacks() -> list[dict]:
    try:
        cf = boto("cloudformation")
        paginator = cf.get_paginator("list_stacks")
        active_statuses = [
            "CREATE_IN_PROGRESS", "CREATE_COMPLETE", "UPDATE_IN_PROGRESS",
            "UPDATE_COMPLETE", "UPDATE_ROLLBACK_COMPLETE", "ROLLBACK_IN_PROGRESS",
            "ROLLBACK_COMPLETE", "DELETE_IN_PROGRESS",
        ]
        stacks = []
        for page in paginator.paginate(StackStatusFilter=active_statuses):
            for s in page["StackSummaries"]:
                if s["StackName"].startswith("orchestryx-lab-"):
                    created = s.get("CreationTime")
                    stacks.append({
                        "name": s["StackName"],
                        "status": s["StackStatus"],
                        "created": created.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M") if created else "—",
                    })
        return stacks
    except Exception:
        return []


def get_security_groups() -> list[dict]:
    try:
        ec2 = boto("ec2")
        resp = ec2.describe_security_groups(GroupIds=[API_SG, WORKER_SG, AURORA_SG])
        groups = []
        for sg in resp.get("SecurityGroups", []):
            groups.append({
                "id": sg.get("GroupId"),
                "name": sg.get("GroupName"),
                "description": sg.get("Description"),
                "vpc": sg.get("VpcId"),
                "ingress": len(sg.get("IpPermissions", [])),
                "egress": len(sg.get("IpPermissionsEgress", [])),
            })
        return groups
    except Exception:
        return [
            {"id": API_SG, "name": "orchestryx-api-sg", "ingress": "—", "egress": "—"},
            {"id": WORKER_SG, "name": "orchestryx-worker-sg", "ingress": "—", "egress": "—"},
            {"id": AURORA_SG, "name": "orchestryx-aurora-sg", "ingress": "—", "egress": "—"},
        ]


def get_costs() -> dict:
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=30)
    try:
        # Cost Explorer is a global billing API exposed from us-east-1.
        ce = boto3.client("ce", region_name="us-east-1")
        resp = ce.get_cost_and_usage(
            TimePeriod={"Start": start.isoformat(), "End": end.isoformat()},
            Granularity="MONTHLY",
            Metrics=["UnblendedCost"],
            GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}],
        )
        services = []
        total = 0.0
        for group in resp.get("ResultsByTime", [{}])[0].get("Groups", []):
            amount = float(group["Metrics"]["UnblendedCost"]["Amount"])
            if amount <= 0:
                continue
            total += amount
            services.append({"service": group["Keys"][0], "amount": round(amount, 2)})
        services.sort(key=lambda x: x["amount"], reverse=True)
        return {
            "period": f"{start.isoformat()} to {end.isoformat()}",
            "total": round(total, 2),
            "currency": "USD",
            "services": services[:8],
            "status": "LIVE",
        }
    except Exception:
        return {
            "period": f"{start.isoformat()} to {end.isoformat()}",
            "total": 0,
            "currency": "USD",
            "services": [],
            "status": "UNAVAILABLE",
        }


def get_ec2_instances() -> list[dict]:
    try:
        ec2 = boto("ec2")
        resp = ec2.describe_instances(
            Filters=[
                {"Name": "vpc-id", "Values": [VPC_ID]},
                {"Name": "instance-state-name", "Values": ["running", "stopped", "pending"]},
            ]
        )
        instances = []
        for reservation in resp.get("Reservations", []):
            for inst in reservation.get("Instances", []):
                name_tag = next(
                    (t["Value"] for t in inst.get("Tags", []) if t["Key"] == "Name"), ""
                )
                instances.append({
                    "id": inst["InstanceId"],
                    "name": name_tag or inst["InstanceId"],
                    "type": inst.get("InstanceType", "—"),
                    "state": inst["State"]["Name"],
                    "private_ip": inst.get("PrivateIpAddress", "—"),
                    "public_ip": inst.get("PublicIpAddress", "—"),
                    "az": inst.get("Placement", {}).get("AvailabilityZone", "—"),
                    "launched": utc(inst.get("LaunchTime")),
                    "image_id": inst.get("ImageId", "—"),
                    "subnet": inst.get("SubnetId", "—"),
                })
        return instances
    except Exception:
        return []


def get_cloudwatch_alarms_summary() -> dict:
    try:
        cw = boto("cloudwatch")
        firing_resp = cw.describe_alarms(StateValue="ALARM")
        firing = [
            {
                "name": a.get("AlarmName", "—"),
                "state": a.get("StateValue", "—"),
                "metric": a.get("MetricName", "—"),
                "namespace": a.get("Namespace", "—"),
                "reason": (a.get("StateReason", "") or "")[:150],
                "updated": utc(a.get("StateUpdatedTimestamp")),
            }
            for a in firing_resp.get("MetricAlarms", [])
        ]
        return {"firing": len(firing), "alarms": firing}
    except Exception:
        return {"firing": 0, "alarms": []}


def get_all_cloudwatch_alarms() -> list[dict]:
    try:
        cw = boto("cloudwatch")
        resp = cw.describe_alarms()
        alarms = []
        for a in resp.get("MetricAlarms", []):
            alarms.append({
                "name": a.get("AlarmName", "—"),
                "state": a.get("StateValue", "—"),
                "metric": a.get("MetricName", "—"),
                "namespace": a.get("Namespace", "—"),
                "threshold": str(a.get("Threshold", "—")),
                "comparison": a.get("ComparisonOperator", "—").replace("GreaterThanOrEqualToThreshold", ">=").replace("GreaterThanThreshold", ">").replace("LessThanOrEqualToThreshold", "<=").replace("LessThanThreshold", "<"),
                "reason": (a.get("StateReason", "") or "")[:150],
                "updated": utc(a.get("StateUpdatedTimestamp")),
            })
        return sorted(alarms, key=lambda x: (x["state"] != "ALARM", x["state"] != "INSUFFICIENT_DATA"))
    except Exception:
        return []


def get_billing_detail() -> dict:
    import calendar as cal
    try:
        ce = boto3.client("ce", region_name="us-east-1")
        today = datetime.now(timezone.utc).date()
        month_start = today.replace(day=1)
        last_day = cal.monthrange(today.year, today.month)[1]
        month_end = today.replace(day=last_day)

        daily_resp = ce.get_cost_and_usage(
            TimePeriod={"Start": month_start.isoformat(), "End": today.isoformat()},
            Granularity="DAILY",
            Metrics=["UnblendedCost"],
        )
        daily = [
            {
                "date": entry["TimePeriod"]["Start"],
                "amount": round(float(entry["Total"]["UnblendedCost"]["Amount"]), 4),
            }
            for entry in daily_resp.get("ResultsByTime", [])
        ]
        mtd = round(sum(d["amount"] for d in daily), 2)

        forecast = None
        if today < month_end:
            try:
                fc_resp = ce.get_cost_forecast(
                    TimePeriod={"Start": today.isoformat(), "End": month_end.isoformat()},
                    Metric="UNBLENDED_COST",
                    Granularity="MONTHLY",
                )
                remaining = float(fc_resp["Total"]["Amount"])
                forecast = round(mtd + remaining, 2)
            except Exception:
                pass

        return {
            "month": month_start.strftime("%B %Y"),
            "month_start": month_start.isoformat(),
            "today": today.isoformat(),
            "mtd": mtd,
            "forecast": forecast,
            "daily": daily,
        }
    except Exception:
        return {"month": "—", "mtd": 0, "forecast": None, "daily": []}


# ── routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/overview")
def overview() -> dict[str, Any]:
    ecs = boto("ecs")
    sqs = boto("sqs")
    api_service = get_ecs_service(ecs, API_SERVICE)
    worker_service = get_ecs_service(ecs, WORKER_SERVICE)
    provision_queue = get_sqs_queue(sqs, SQS_PROVISION)
    destroy_queue = get_sqs_queue(sqs, SQS_DESTROY)
    return {
        "ecs": {
            "cluster": CLUSTER,
            "api": api_service,
            "worker": worker_service,
        },
        "tasks": get_tasks(ecs),
        "aurora": get_aurora(),
        "sqs": {
            "provision": provision_queue,
            "destroy": destroy_queue,
        },
        "cognito": get_cognito_pool(),
        "ecr": {
            "api": get_ecr_image(ECR_API),
            "worker": get_ecr_image(ECR_WORKER),
        },
        "logs": {
            "api": get_log_group(LOG_GROUP_API),
            "worker": get_log_group(LOG_GROUP_WORKER),
        },
        "network": {
            "vpc": VPC_ID,
            "subnets": SUBNETS,
            "security_groups": get_security_groups(),
        },
        "costs": get_costs(),
        "secrets": {"runtime_env": SECRET_ARN},
        "stacks": get_stacks(),
        "alarms": get_cloudwatch_alarms_summary(),
        "ec2": get_ec2_instances(),
    }


@app.get("/api/service/{service}")
def service_detail(service: str) -> dict[str, Any]:
    if service not in ("api", "worker"):
        raise HTTPException(status_code=400, detail="service must be api or worker")

    ecs = boto("ecs")
    svc_name = API_SERVICE if service == "api" else WORKER_SERVICE
    repo = ECR_API if service == "api" else ECR_WORKER
    log_group = LOG_GROUP_API if service == "api" else LOG_GROUP_WORKER
    task_family = "orchestryx-api" if service == "api" else "orchestryx-worker"
    service_data = get_ecs_service(ecs, svc_name)

    task_definition = {}
    try:
        td = ecs.describe_task_definition(taskDefinition=task_family)["taskDefinition"]
        containers = td.get("containerDefinitions", [])
        task_definition = {
            "family": td.get("family"),
            "revision": td.get("revision"),
            "cpu": td.get("cpu"),
            "memory": td.get("memory"),
            "network": td.get("networkMode"),
            "compatibilities": td.get("requiresCompatibilities", []),
            "task_role": td.get("taskRoleArn", "").split("/")[-1],
            "execution_role": td.get("executionRoleArn", "").split("/")[-1],
            "containers": [
                {
                    "name": c.get("name"),
                    "image": c.get("image"),
                    "command": " ".join(c.get("command", [])),
                    "ports": [p.get("containerPort") for p in c.get("portMappings", [])],
                    "secrets": [s.get("name") for s in c.get("secrets", [])],
                }
                for c in containers
            ],
        }
    except Exception:
        task_definition = {"family": task_family, "status": "ERROR"}

    return {
        "service": service_data,
        "tasks": [t for t in get_tasks(ecs) if t.get("service") == service],
        "task_definition": task_definition,
        "image": get_ecr_image(repo),
        "logs": get_log_group(log_group),
        "network": {
            "cluster": CLUSTER,
            "vpc": VPC_ID,
            "subnets": SUBNETS,
            "security_group": API_SG if service == "api" else WORKER_SG,
        },
    }


@app.get("/api/logs/{service}", response_class=PlainTextResponse)
def logs(service: str):
    if service not in ("api", "worker"):
        raise HTTPException(status_code=400, detail="service must be api or worker")
    log_group = LOG_GROUP_API if service == "api" else LOG_GROUP_WORKER
    try:
        logs_client = boto("logs")
        streams = logs_client.describe_log_streams(
            logGroupName=log_group,
            orderBy="LastEventTime",
            descending=True,
            limit=3,
        ).get("logStreams", [])
        if not streams:
            return "No log streams found."
        lines: list[str] = []
        for stream in streams:
            events = logs_client.get_log_events(
                logGroupName=log_group,
                logStreamName=stream["logStreamName"],
                limit=50,
                startFromHead=False,
            ).get("events", [])
            for e in events:
                ts = datetime.fromtimestamp(e["timestamp"] / 1000, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                lines.append(f"{ts}  {e['message'].rstrip()}")
            if len(lines) >= 50:
                break
        lines = lines[-50:]
        return "\n".join(lines) if lines else "No log events found."
    except Exception as exc:
        return f"Error fetching logs: {exc}"


@app.post("/api/restart/{service}")
def restart(service: str):
    if service not in ("api", "worker"):
        raise HTTPException(status_code=400, detail="service must be api or worker")
    svc_name = API_SERVICE if service == "api" else WORKER_SERVICE
    try:
        ecs = boto("ecs")
        ecs.update_service(cluster=CLUSTER, service=svc_name, forceNewDeployment=True)
        return {"ok": True, "message": f"Force-redeploying {svc_name}"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/deploy")
def deploy():
    # The cockpit runs on Windows too, but deployment is executed through the
    # Bash script because it is the canonical CI/Linux path.
    script = Path(__file__).parent.parent / "scripts" / "linux" / "deploy.sh"
    if not script.exists():
        raise HTTPException(status_code=404, detail="scripts/linux/deploy.sh not found")
    try:
        result = subprocess.run(
            ["bash", str(script)],
            capture_output=True,
            text=True,
            timeout=600,
        )
        return {
            "ok": result.returncode == 0,
            "stdout": result.stdout[-4000:],
            "stderr": result.stderr[-2000:],
        }
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Deploy timed out after 10 minutes")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/tasks")
def tasks():
    ecs = boto("ecs")
    return {"tasks": get_tasks(ecs)}


@app.get("/api/stacks")
def stacks():
    return {"stacks": get_stacks()}


@app.post("/api/stacks/{name}/destroy")
def destroy_stack(name: str):
    if not name.startswith("orchestryx-lab-"):
        raise HTTPException(status_code=400, detail="Only orchestryx-lab-* stacks can be destroyed")
    try:
        cf = boto("cloudformation")
        cf.delete_stack(StackName=name)
        return {"ok": True, "message": f"Deletion initiated for {name}"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/billing")
def billing() -> dict[str, Any]:
    basic = get_costs()
    detail = get_billing_detail()
    return {**basic, **detail}


@app.get("/api/alarms")
def alarms_route() -> dict[str, Any]:
    return {"alarms": get_all_cloudwatch_alarms()}
