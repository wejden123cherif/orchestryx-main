#!/usr/bin/env python3
"""
Orchestryx AWS Status — terminal operator console.

Usage:
  python scripts/aws/status.py              # full overview
  python scripts/aws/status.py --section ecs billing alarms
  python scripts/aws/status.py --logs api
  python scripts/aws/status.py --restart api
  python scripts/aws/status.py --restart worker
  python scripts/aws/status.py --deploy

Requires: boto3, AWS credentials configured (env vars or ~/.aws).
"""

import argparse
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    import boto3
except ImportError:
    print("boto3 not found — run: pip install boto3")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────
# All values are read from environment variables so this script works across
# AWS accounts and regions without code changes.
#
# Minimal required setup:
#   export AWS_REGION=eu-central-1
#   export AWS_ACCOUNT_ID=123456789012   # or let boto3 resolve via STS
#
# Optional overrides (all have sensible defaults):
#   ORCHESTRYX_CLUSTER, ORCHESTRYX_VPC_ID, ORCHESTRYX_COGNITO_POOL, etc.

import os as _os

def _env(name: str, default: str = "") -> str:
    return _os.environ.get(name, default).strip() or default

def _resolve_account_id() -> str:
    """Return AWS_ACCOUNT_ID from env, or resolve it via STS."""
    account = _env("AWS_ACCOUNT_ID")
    if account:
        return account
    try:
        return boto3.client("sts").get_caller_identity()["Account"]
    except Exception:
        return "ACCOUNT_ID_UNKNOWN"

REGION        = _env("AWS_REGION", "eu-central-1")
ACCOUNT_ID    = _resolve_account_id()
CLUSTER       = _env("AWS_ECS_CLUSTER", "orchestryx")
API_SERVICE   = _env("AWS_API_SERVICE", "orchestryx-api-service")
WORKER_SERVICE= _env("AWS_WORKER_SERVICE", "orchestryx-worker-service")
ECR_API       = _env("AWS_ECR_API_REPOSITORY",
                     f"{ACCOUNT_ID}.dkr.ecr.{REGION}.amazonaws.com/orchestryx-api")
ECR_WORKER    = _env("AWS_ECR_WORKER_REPOSITORY",
                     f"{ACCOUNT_ID}.dkr.ecr.{REGION}.amazonaws.com/orchestryx-worker")
LOG_GROUP_API    = _env("AWS_API_LOG_GROUP", "/ecs/orchestryx-api")
LOG_GROUP_WORKER = _env("AWS_WORKER_LOG_GROUP", "/ecs/orchestryx-worker")
AURORA_CLUSTER= _env("AWS_AURORA_CLUSTER", "orchestryx-db")
SQS_PROVISION = _env("PROVISION_QUEUE", "orchestryx-provision-lab")
SQS_DESTROY   = _env("DESTROY_QUEUE", "orchestryx-destroy-lab")
COGNITO_POOL  = _env("AWS_COGNITO_POOL_ID", _env("COGNITO_USER_POOL_ID", ""))
VPC_ID        = _env("AWS_VPC_ID", "")
# Security group IDs — optional; status.py will skip SG checks if not set.
API_SG        = _env("ORCHESTRYX_API_SG", "")
WORKER_SG     = _env("ORCHESTRYX_WORKER_SG", "")
AURORA_SG     = _env("ORCHESTRYX_AURORA_SG", "")
IAM_ROLES     = ["orchestryx-ecs-execution-role", "orchestryx-api-task-role", "orchestryx-worker-task-role"]

SECTIONS = ["ecs", "aurora", "sqs", "ecr", "logs", "ec2", "stacks", "sg", "cognito", "billing", "alarms"]

# ── ANSI colours ──────────────────────────────────────────────────────────────

RESET  = "\033[0m"
BOLD   = "\033[1m"
DIM    = "\033[2m"
CYAN   = "\033[36m"
GREEN  = "\033[32m"
YELLOW = "\033[33m"
RED    = "\033[31m"
BLUE   = "\033[34m"
MAGENTA= "\033[35m"
WHITE  = "\033[97m"

def c(text: str, color: str) -> str:
    return f"{color}{text}{RESET}"

def header(title: str) -> None:
    width = 60
    print()
    print(c("─" * width, CYAN))
    print(c(f"  {title}", BOLD + CYAN))
    print(c("─" * width, CYAN))

def row(label: str, value: str, vc: str = WHITE) -> None:
    print(f"  {c(label.ljust(24), DIM)}  {c(value, vc)}")

def ok(value: str) -> str:
    v = str(value).upper()
    if any(x in v for x in ("ACTIVE", "RUNNING", "READY", "OK", "CREATE_COMPLETE", "AVAILABLE")):
        return c(str(value), GREEN)
    if any(x in v for x in ("PENDING", "UPDATING", "PROVISIONING", "DEPLOYING")):
        return c(str(value), YELLOW)
    if any(x in v for x in ("ERROR", "FAILED", "ALARM", "ROLLBACK")):
        return c(str(value), RED)
    return c(str(value), WHITE)

def utc(dt) -> str:
    if not dt:
        return "—"
    if hasattr(dt, "astimezone"):
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    return str(dt)

def boto_client(service: str):
    region = "us-east-1" if service == "ce" else REGION
    return boto3.client(service, region_name=region)

# ── Data fetchers ─────────────────────────────────────────────────────────────

def fetch_ecs() -> dict:
    try:
        ecs = boto_client("ecs")
        resp = ecs.describe_services(cluster=CLUSTER, services=[API_SERVICE, WORKER_SERVICE])
        services = {}
        for svc in resp["services"]:
            name = "api" if API_SERVICE in svc["serviceName"] else "worker"
            services[name] = {
                "desired":  svc["desiredCount"],
                "running":  svc["runningCount"],
                "pending":  svc["pendingCount"],
                "status":   svc["status"],
                "task_def": svc.get("taskDefinition", "").split("/")[-1],
                "rollout":  (svc.get("deployments") or [{}])[0].get("rolloutState", "—"),
                "events":   [(e.get("message", "")) for e in svc.get("events", [])[:4]],
            }

        # Tasks
        task_arns = []
        for svc_name in [API_SERVICE, WORKER_SERVICE]:
            task_arns.extend(ecs.list_tasks(cluster=CLUSTER, serviceName=svc_name).get("taskArns", []))

        tasks = []
        if task_arns:
            for t in ecs.describe_tasks(cluster=CLUSTER, tasks=task_arns)["tasks"]:
                svc_tag = "api" if API_SERVICE in (t.get("group") or "") else "worker"
                ip = ""
                for att in t.get("attachments", []):
                    for detail in att.get("details", []):
                        if detail.get("name") == "privateIPv4Address":
                            ip = detail["value"]
                tasks.append({
                    "id":      t["taskArn"].split("/")[-1][:12],
                    "service": svc_tag,
                    "status":  t.get("lastStatus", "UNKNOWN"),
                    "cpu":     t.get("cpu", "—"),
                    "memory":  t.get("memory", "—"),
                    "ip":      ip,
                    "started": utc(t.get("startedAt")),
                    "task_def": t.get("taskDefinitionArn", "").split("/")[-1],
                })
        return {"services": services, "tasks": tasks}
    except Exception as e:
        return {"error": str(e)}


def fetch_aurora() -> dict:
    try:
        rds = boto_client("rds")
        c = rds.describe_db_clusters(DBClusterIdentifier=AURORA_CLUSTER)["DBClusters"][0]
        return {
            "id":       c.get("DBClusterIdentifier"),
            "status":   c["Status"],
            "engine":   c.get("Engine"),
            "version":  c.get("EngineVersion"),
            "endpoint": c.get("Endpoint"),
            "reader":   c.get("ReaderEndpoint"),
            "azs":      ", ".join(c.get("AvailabilityZones", [])),
        }
    except Exception as e:
        return {"error": str(e)}


def fetch_sqs() -> dict:
    try:
        sqs = boto_client("sqs")
        def queue_info(name):
            url = sqs.get_queue_url(QueueName=name)["QueueUrl"]
            attrs = sqs.get_queue_attributes(
                QueueUrl=url,
                AttributeNames=["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"],
            )["Attributes"]
            return {
                "name":      name,
                "queued":    int(attrs.get("ApproximateNumberOfMessages", 0)),
                "in_flight": int(attrs.get("ApproximateNumberOfMessagesNotVisible", 0)),
            }
        return {
            "provision": queue_info(SQS_PROVISION),
            "destroy":   queue_info(SQS_DESTROY),
        }
    except Exception as e:
        return {"error": str(e)}


def fetch_ecr() -> dict:
    try:
        ecr = boto_client("ecr")
        def image_info(repo_uri):
            repo = repo_uri.split("/")[-1]
            images = ecr.describe_images(repositoryName=repo, filter={"tagStatus": "TAGGED"})["imageDetails"]
            if not images:
                return {"repo": repo, "pushed": "—", "size_mb": 0, "tags": []}
            latest = sorted(images, key=lambda x: x.get("imagePushedAt", datetime.min.replace(tzinfo=timezone.utc)), reverse=True)[0]
            pushed = latest.get("imagePushedAt")
            return {
                "repo":    repo,
                "uri":     repo_uri,
                "pushed":  pushed.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC") if pushed else "—",
                "size_mb": round(latest.get("imageSizeInBytes", 0) / 1_048_576),
                "tags":    latest.get("imageTags", []),
                "digest":  latest.get("imageDigest", "")[:24],
            }
        return {"api": image_info(ECR_API), "worker": image_info(ECR_WORKER)}
    except Exception as e:
        return {"error": str(e)}


def fetch_log_group(log_group: str) -> dict:
    try:
        logs = boto_client("logs")
        groups = logs.describe_log_groups(logGroupNamePrefix=log_group).get("logGroups", [])
        match = next((g for g in groups if g["logGroupName"] == log_group), {})
        streams = logs.describe_log_streams(
            logGroupName=log_group, orderBy="LastEventTime", descending=True, limit=1
        ).get("logStreams", [])
        latest_ts = streams[0].get("lastEventTimestamp") if streams else None
        return {
            "name":       log_group,
            "stored_mb":  round(match.get("storedBytes", 0) / 1_048_576, 2),
            "retention":  match.get("retentionInDays", "Never expire"),
            "latest_stream": streams[0].get("logStreamName", "—") if streams else "—",
            "latest_event":  utc(datetime.fromtimestamp(latest_ts / 1000, tz=timezone.utc)) if latest_ts else "—",
        }
    except Exception as e:
        return {"error": str(e)}


def fetch_ec2() -> list:
    try:
        ec2 = boto_client("ec2")
        filters = [{"Name": "instance-state-name", "Values": ["running", "stopped", "pending"]}]
        if VPC_ID:
            filters.append({"Name": "vpc-id", "Values": [VPC_ID]})
        resp = ec2.describe_instances(Filters=filters)
        instances = []
        for reservation in resp.get("Reservations", []):
            for inst in reservation.get("Instances", []):
                name = next((t["Value"] for t in inst.get("Tags", []) if t["Key"] == "Name"), inst["InstanceId"])
                instances.append({
                    "id":         inst["InstanceId"],
                    "name":       name,
                    "type":       inst.get("InstanceType", "—"),
                    "state":      inst["State"]["Name"],
                    "private_ip": inst.get("PrivateIpAddress", "—"),
                    "public_ip":  inst.get("PublicIpAddress", "—"),
                    "az":         inst.get("Placement", {}).get("AvailabilityZone", "—"),
                    "launched":   utc(inst.get("LaunchTime")),
                })
        return instances
    except Exception as e:
        return [{"error": str(e)}]


def fetch_stacks() -> list:
    try:
        cf = boto_client("cloudformation")
        paginator = cf.get_paginator("list_stacks")
        active = [
            "CREATE_IN_PROGRESS", "CREATE_COMPLETE", "UPDATE_IN_PROGRESS",
            "UPDATE_COMPLETE", "UPDATE_ROLLBACK_COMPLETE", "ROLLBACK_IN_PROGRESS",
            "ROLLBACK_COMPLETE", "DELETE_IN_PROGRESS",
        ]
        stacks = []
        for page in paginator.paginate(StackStatusFilter=active):
            for s in page["StackSummaries"]:
                if s["StackName"].startswith(("OrchestryxDev-", "OrchestryxStaging-", "OrchestryxProd-")):
                    stacks.append({
                        "name":    s["StackName"],
                        "status":  s["StackStatus"],
                        "created": utc(s.get("CreationTime")),
                    })
        return stacks
    except Exception as e:
        return [{"error": str(e)}]


def fetch_sg() -> list:
    sg_ids = [sg for sg in [API_SG, WORKER_SG, AURORA_SG] if sg]
    if not sg_ids:
        return [{"error": "No security group IDs configured. Set ORCHESTRYX_API_SG, ORCHESTRYX_WORKER_SG, ORCHESTRYX_AURORA_SG."}]
    try:
        ec2 = boto_client("ec2")
        resp = ec2.describe_security_groups(GroupIds=sg_ids)
        return [
            {
                "id":       sg["GroupId"],
                "name":     sg["GroupName"],
                "vpc":      sg.get("VpcId"),
                "inbound":  len(sg.get("IpPermissions", [])),
                "outbound": len(sg.get("IpPermissionsEgress", [])),
            }
            for sg in resp.get("SecurityGroups", [])
        ]
    except Exception as e:
        return [{"error": str(e)}]


def fetch_cognito() -> dict:
    if not COGNITO_POOL:
        return {"error": "COGNITO_USER_POOL_ID or AWS_COGNITO_POOL_ID not set."}
    try:
        idp = boto_client("cognito-idp")
        pool = idp.describe_user_pool(UserPoolId=COGNITO_POOL)["UserPool"]
        return {
            "id":    COGNITO_POOL,
            "name":  pool.get("Name"),
            "users": pool.get("EstimatedNumberOfUsers", 0),
            "status": pool.get("Status", "ACTIVE"),
            "mfa":   pool.get("MfaConfiguration", "OFF"),
            "created": utc(pool.get("CreationDate")),
        }
    except Exception as e:
        return {"error": str(e)}


def fetch_billing() -> dict:
    import calendar as cal
    try:
        ce = boto_client("ce")
        today = datetime.now(timezone.utc).date()
        start = (today - timedelta(days=30))
        month_start = today.replace(day=1)
        last_day = cal.monthrange(today.year, today.month)[1]
        month_end = today.replace(day=last_day)

        # 30-day by service
        by_svc = ce.get_cost_and_usage(
            TimePeriod={"Start": start.isoformat(), "End": today.isoformat()},
            Granularity="MONTHLY",
            Metrics=["UnblendedCost"],
            GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}],
        )
        services, total = [], 0.0
        for g in (by_svc.get("ResultsByTime") or [{}])[0].get("Groups", []):
            amt = float(g["Metrics"]["UnblendedCost"]["Amount"])
            if amt <= 0:
                continue
            total += amt
            services.append({"service": g["Keys"][0], "amount": round(amt, 2)})
        services.sort(key=lambda x: x["amount"], reverse=True)

        # Daily MTD
        daily_resp = ce.get_cost_and_usage(
            TimePeriod={"Start": month_start.isoformat(), "End": today.isoformat()},
            Granularity="DAILY",
            Metrics=["UnblendedCost"],
        )
        daily = [
            {"date": e["TimePeriod"]["Start"], "amount": round(float(e["Total"]["UnblendedCost"]["Amount"]), 4)}
            for e in daily_resp.get("ResultsByTime", [])
        ]
        mtd = round(sum(d["amount"] for d in daily), 2)

        # Forecast
        forecast = None
        if today < month_end:
            try:
                fc = ce.get_cost_forecast(
                    TimePeriod={"Start": today.isoformat(), "End": month_end.isoformat()},
                    Metric="UNBLENDED_COST", Granularity="MONTHLY",
                )
                forecast = round(mtd + float(fc["Total"]["Amount"]), 2)
            except Exception:
                pass

        return {
            "period":   f"{start.isoformat()} → {today.isoformat()}",
            "total":    round(total, 2),
            "services": services[:10],
            "mtd":      mtd,
            "forecast": forecast,
            "daily":    daily[-7:],
        }
    except Exception as e:
        return {"error": str(e)}


def fetch_alarms() -> list:
    try:
        cw = boto_client("cloudwatch")
        resp = cw.describe_alarms()
        alarms = []
        for a in resp.get("MetricAlarms", []):
            alarms.append({
                "name":      a.get("AlarmName"),
                "state":     a.get("StateValue"),
                "metric":    a.get("MetricName"),
                "namespace": a.get("Namespace"),
                "threshold": a.get("Threshold"),
                "reason":    (a.get("StateReason") or "")[:120],
                "updated":   utc(a.get("StateUpdatedTimestamp")),
            })
        return sorted(alarms, key=lambda x: (x["state"] != "ALARM", x["state"] != "INSUFFICIENT_DATA"))
    except Exception as e:
        return [{"error": str(e)}]


def fetch_logs_tail(service: str, lines: int = 60) -> str:
    log_group = LOG_GROUP_API if service == "api" else LOG_GROUP_WORKER
    try:
        logs = boto_client("logs")
        streams = logs.describe_log_streams(
            logGroupName=log_group, orderBy="LastEventTime", descending=True, limit=3
        ).get("logStreams", [])
        if not streams:
            return "No log streams found."
        output = []
        for stream in streams:
            events = logs.get_log_events(
                logGroupName=log_group,
                logStreamName=stream["logStreamName"],
                limit=lines,
                startFromHead=False,
            ).get("events", [])
            for e in events:
                ts = datetime.fromtimestamp(e["timestamp"] / 1000, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                output.append(f"{c(ts, DIM)}  {e['message'].rstrip()}")
            if len(output) >= lines:
                break
        return "\n".join(output[-lines:]) if output else "No log events found."
    except Exception as e:
        return f"Error: {e}"

# ── Printers ──────────────────────────────────────────────────────────────────

def print_ecs() -> None:
    header("ECS — Cluster & Services")
    data = fetch_ecs()
    if "error" in data:
        print(c(f"  ERROR: {data['error']}", RED)); return

    for name, svc in data.get("services", {}).items():
        print(f"\n  {c(name.upper() + ' SERVICE', BOLD + YELLOW)}")
        row("Status",      svc["status"],  ok(svc["status"]))
        row("Tasks",       f"{svc['running']} running / {svc['pending']} pending / {svc['desired']} desired",
            GREEN if svc["running"] == svc["desired"] else YELLOW)
        row("Task def",    svc["task_def"])
        row("Rollout",     svc["rollout"],  ok(svc["rollout"]))
        if svc.get("events"):
            print(f"  {c('Recent events:', DIM)}")
            for ev in svc["events"]:
                print(f"    {c('·', DIM)} {ev[:90]}")

    tasks = data.get("tasks", [])
    if tasks:
        print(f"\n  {c('RUNNING TASKS', BOLD + YELLOW)}")
        for t in tasks:
            row(f"  {t['id']}",
                f"{t['service']}  {t['status']}  {t['ip']}  cpu={t['cpu']} mem={t['memory']}  started={t['started']}",
                ok(t["status"]))
    else:
        print(f"\n  {c('No running tasks', DIM)}")


def print_aurora() -> None:
    header("Aurora — Database Cluster")
    d = fetch_aurora()
    if "error" in d:
        print(c(f"  ERROR: {d['error']}", RED)); return
    row("Cluster",  d["id"])
    row("Status",   d["status"], ok(d["status"]))
    row("Engine",   f"{d['engine']} {d['version']}")
    row("Endpoint", d["endpoint"])
    row("Reader",   d["reader"])
    row("AZs",      d["azs"])


def print_sqs() -> None:
    header("SQS — Queues")
    d = fetch_sqs()
    if "error" in d:
        print(c(f"  ERROR: {d['error']}", RED)); return
    for key, q in d.items():
        print(f"\n  {c(q['name'], YELLOW)}")
        row("Queued",    str(q["queued"]),    GREEN if q["queued"] == 0 else YELLOW)
        row("In-flight", str(q["in_flight"]), GREEN if q["in_flight"] == 0 else YELLOW)


def print_ecr() -> None:
    header("ECR — Container Images")
    d = fetch_ecr()
    if "error" in d:
        print(c(f"  ERROR: {d['error']}", RED)); return
    for key, img in d.items():
        print(f"\n  {c(img['repo'], YELLOW)}")
        row("Pushed",  img["pushed"])
        row("Size",    f"{img['size_mb']} MB")
        row("Tags",    ", ".join(img["tags"]) or "—")
        row("Digest",  img["digest"])


def print_logs_meta() -> None:
    header("CloudWatch — Log Groups")
    for name, log_group in [("api", LOG_GROUP_API), ("worker", LOG_GROUP_WORKER)]:
        d = fetch_log_group(log_group)
        print(f"\n  {c(name.upper(), YELLOW)}")
        if "error" in d:
            print(c(f"  ERROR: {d['error']}", RED)); continue
        row("Log group",     d["name"])
        row("Stored",        f"{d['stored_mb']} MB")
        row("Retention",     str(d["retention"]))
        row("Latest stream", d["latest_stream"])
        row("Latest event",  d["latest_event"])


def print_ec2() -> None:
    header("EC2 — Instances in VPC")
    instances = fetch_ec2()
    if not instances or "error" in instances[0]:
        print(c(f"  ERROR: {instances[0].get('error', 'Unknown')}", RED) if instances else "  No instances"); return
    if not instances:
        print(c("  No instances found", DIM)); return
    for inst in instances:
        print(f"\n  {c(inst['name'], YELLOW)} ({inst['id']})")
        row("State",      inst["state"],      ok(inst["state"]))
        row("Type",       inst["type"])
        row("Private IP", inst["private_ip"])
        row("Public IP",  inst["public_ip"])
        row("AZ",         inst["az"])
        row("Launched",   inst["launched"])


def print_stacks() -> None:
    header("CloudFormation — Platform Stacks")
    stacks = fetch_stacks()
    if not stacks:
        print(c("  No active platform stacks", DIM)); return
    if "error" in stacks[0]:
        print(c(f"  ERROR: {stacks[0]['error']}", RED)); return
    for s in stacks:
        row(s["name"], f"{s['status']}  {s['created']}", ok(s["status"]))


def print_sg() -> None:
    header("Security Groups")
    sgs = fetch_sg()
    if not sgs or "error" in sgs[0]:
        print(c(f"  ERROR: {sgs[0].get('error', 'Unknown')}", RED) if sgs else "  Error"); return
    for sg in sgs:
        print(f"\n  {c(sg['name'], YELLOW)} ({sg['id']})")
        row("VPC",      sg["vpc"])
        row("Inbound",  str(sg["inbound"]))
        row("Outbound", str(sg["outbound"]))


def print_cognito() -> None:
    header("Cognito — User Pool")
    d = fetch_cognito()
    if "error" in d:
        print(c(f"  ERROR: {d['error']}", RED)); return
    row("Pool ID",  d["id"])
    row("Name",     d["name"])
    row("Status",   d["status"], ok(d["status"]))
    row("Users",    str(d["users"]))
    row("MFA",      d["mfa"])
    row("Created",  d["created"])


def print_billing() -> None:
    header("Cost Explorer — Billing")
    d = fetch_billing()
    if "error" in d:
        print(c(f"  ERROR: {d['error']}", RED)); return
    row("Period",    d["period"])
    row("30-day total", f"${d['total']:.2f}", GREEN if d["total"] < 50 else YELLOW)
    row("MTD",       f"${d['mtd']:.2f}")
    if d["forecast"]:
        row("Forecast", f"${d['forecast']:.2f}", YELLOW)
    if d["services"]:
        print(f"\n  {c('Top services', BOLD)}")
        for svc in d["services"]:
            row(f"  {svc['service'][:28]}", f"${svc['amount']:.2f}")
    if d["daily"]:
        print(f"\n  {c('Last 7 days', BOLD)}")
        for day in d["daily"]:
            bar_len = int(day["amount"] * 10)
            bar = "█" * min(bar_len, 30)
            print(f"  {c(day['date'], DIM)}  {c(f'${day[\"amount\"]:7.4f}', WHITE)}  {c(bar, BLUE)}")


def print_alarms() -> None:
    header("CloudWatch — Alarms")
    alarms = fetch_alarms()
    if not alarms or "error" in alarms[0]:
        print(c(f"  ERROR: {alarms[0].get('error', 'Unknown')}", RED) if alarms else "  Error"); return
    if not alarms:
        print(c("  No alarms configured", DIM)); return
    for a in alarms:
        state_color = RED if a["state"] == "ALARM" else (YELLOW if a["state"] == "INSUFFICIENT_DATA" else GREEN)
        print(f"\n  {c(a['name'], YELLOW)}")
        row("State",     a["state"],     state_color)
        row("Metric",    f"{a['namespace']}/{a['metric']}")
        row("Threshold", str(a["threshold"]))
        row("Updated",   a["updated"])
        if a["reason"]:
            print(f"  {c('Reason:', DIM)} {a['reason']}")

# ── Actions ───────────────────────────────────────────────────────────────────

def action_logs(service: str) -> None:
    print(c(f"\n  Fetching latest logs for {service}…\n", CYAN))
    print(fetch_logs_tail(service))
    print()


def action_restart(service: str) -> None:
    svc_name = API_SERVICE if service == "api" else WORKER_SERVICE
    print(c(f"\n  Forcing new deployment for {svc_name}…", YELLOW))
    confirm = input(c("  Type 'yes' to confirm: ", BOLD))
    if confirm.strip().lower() != "yes":
        print(c("  Aborted.", DIM)); return
    try:
        ecs = boto_client("ecs")
        ecs.update_service(cluster=CLUSTER, service=svc_name, forceNewDeployment=True)
        print(c(f"  ✓ Redeployment triggered for {svc_name}", GREEN))
    except Exception as e:
        print(c(f"  ERROR: {e}", RED))


def action_deploy() -> None:
    script = Path(__file__).parent.parent / "linux" / "deploy.sh"
    if not script.exists():
        print(c(f"  ERROR: {script} not found", RED)); return
    print(c(f"\n  Running {script}…", YELLOW))
    confirm = input(c("  Type 'yes' to confirm full deploy: ", BOLD))
    if confirm.strip().lower() != "yes":
        print(c("  Aborted.", DIM)); return
    result = subprocess.run(["bash", str(script)], text=True)
    if result.returncode != 0:
        print(c("  Deploy returned a non-zero exit code.", RED))


# ── Main ──────────────────────────────────────────────────────────────────────

SECTION_FNS = {
    "ecs":     print_ecs,
    "aurora":  print_aurora,
    "sqs":     print_sqs,
    "ecr":     print_ecr,
    "logs":    print_logs_meta,
    "ec2":     print_ec2,
    "stacks":  print_stacks,
    "sg":      print_sg,
    "cognito": print_cognito,
    "billing": print_billing,
    "alarms":  print_alarms,
}

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Orchestryx AWS status — terminal operator console",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/aws/status.py                         # full overview
  python scripts/aws/status.py --section ecs billing   # specific sections
  python scripts/aws/status.py --logs api              # tail api logs
  python scripts/aws/status.py --logs worker           # tail worker logs
  python scripts/aws/status.py --restart api           # force-redeploy api
  python scripts/aws/status.py --deploy                # run deploy.sh
        """,
    )
    parser.add_argument(
        "--section", nargs="+",
        choices=SECTIONS + ["all"],
        metavar="SECTION",
        help=f"Sections to show: {', '.join(SECTIONS)} (default: all)",
    )
    parser.add_argument("--logs",    choices=["api", "worker"], metavar="SERVICE", help="Tail CloudWatch logs")
    parser.add_argument("--restart", choices=["api", "worker"], metavar="SERVICE", help="Force-redeploy ECS service")
    parser.add_argument("--deploy",  action="store_true", help="Run scripts/linux/deploy.sh")

    args = parser.parse_args()

    # Actions take priority
    if args.logs:
        action_logs(args.logs); return
    if args.restart:
        action_restart(args.restart); return
    if args.deploy:
        action_deploy(); return

    # Status report
    print()
    print(c("╔══════════════════════════════════════════════════════════╗", CYAN))
    print(c("║              ORCHESTRYX  AWS  STATUS                    ║", BOLD + CYAN))
    print(c("╚══════════════════════════════════════════════════════════╝", CYAN))
    print(c(f"  Region: {REGION}   Cluster: {CLUSTER}   {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}", DIM))

    sections = args.section or ["all"]
    if "all" in sections or not args.section:
        for fn in SECTION_FNS.values():
            fn()
    else:
        for s in sections:
            SECTION_FNS[s]()

    print()
    print(c("─" * 60, CYAN))
    print(c("  Done.", DIM))
    print()


if __name__ == "__main__":
    main()
