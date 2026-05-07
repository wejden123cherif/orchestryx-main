"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Boxes,
  Cloud,
  Coins,
  Cpu,
  Database,
  Gauge,
  HardDrive,
  Layers,
  ListChecks,
  LockKeyhole,
  Network,
  RefreshCw,
  Route,
  Server,
  Shield,
  ShieldCheck,
  Square,
  Terminal,
  Users,
  WalletCards,
} from "lucide-react";
import { motion } from "framer-motion";
import { StatusBadge } from "@/components/platform/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/useAuth";
import {
  adjustAdminUserCredits,
  adminStopLab,
  extractApiErrorMessage,
  getAdminCreditTransactions,
  getAdminAwsLogs,
  getAdminAwsOverview,
  getAdminEvents,
  getAdminLabs,
  getAdminOverview,
  getAdminUsers,
} from "@/lib/api";
import type {
  AdminLab,
  AdminOverview,
  AdminUser,
  AwsEcrImage,
  AwsLogGroup,
  AwsOverview,
  AwsQueue,
  CreditTransaction,
  LabEvent,
} from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

type AdminTab = "aws" | "labs" | "users" | "events" | "credits";

function Metric({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon
          className={cn(
            "h-4 w-4",
            tone === "danger" ? "text-red-300" : tone === "warning" ? "text-amber-300" : "text-primary"
          )}
        />
      </div>
      <p className="mt-3 text-3xl text-foreground">{value}</p>
    </motion.div>
  );
}

function fmt(value?: string | null): string {
  return value ? formatDateTime(value) : "Unavailable";
}

function healthTone(status?: string | null): "default" | "warning" | "danger" {
  const normalized = String(status ?? "").toUpperCase();
  if (["ACTIVE", "OK", "CREATE_COMPLETE", "UPDATE_COMPLETE", "RUNNING", "LIVE"].includes(normalized)) {
    return "default";
  }
  if (["ERROR", "FAILED", "ROLLBACK_COMPLETE", "ALARM"].includes(normalized)) {
    return "danger";
  }
  return "warning";
}

function HealthPill({ value }: { value?: string | null }) {
  const tone = healthTone(value);
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs",
        tone === "danger"
          ? "border-red-400/35 bg-red-500/10 text-red-300"
          : tone === "warning"
            ? "border-amber-400/35 bg-amber-500/10 text-amber-300"
            : "border-green-400/35 bg-green-500/10 text-green-300"
      )}
    >
      {value ?? "Unknown"}
    </span>
  );
}

function UtilBar({ label, value }: { label: string; value?: number | null }) {
  const normalized = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="mono text-foreground">{value == null ? "-" : `${normalized.toFixed(1)}%`}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            normalized > 85 ? "bg-red-400" : normalized > 65 ? "bg-amber-300" : "bg-primary"
          )}
          style={{ width: `${normalized}%` }}
        />
      </div>
    </div>
  );
}

function CloudNode({
  icon: Icon,
  title,
  detail,
  status,
}: {
  icon: typeof Cloud;
  title: string;
  detail: string;
  status?: string | null;
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="relative rounded-lg border border-border bg-secondary/45 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm text-foreground">{title}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p>
          </div>
        </div>
        <HealthPill value={status ?? "OK"} />
      </div>
    </motion.div>
  );
}

function ResourceMiniTable({
  title,
  icon: Icon,
  rows,
  empty,
}: {
  title: string;
  icon: typeof Cloud;
  rows: Array<{ id: string; primary: string; secondary: string; status?: string | null }>;
  empty: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h3 className="text-lg text-foreground">{title}</h3>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="max-h-80 overflow-auto">
        {rows.length ? (
          rows.map((row) => (
            <div key={row.id} className="grid gap-3 border-b border-border p-4 last:border-b-0 md:grid-cols-[1fr_auto] md:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{row.primary}</p>
                <p className="truncate text-xs text-muted-foreground">{row.secondary}</p>
              </div>
              <HealthPill value={row.status} />
            </div>
          ))
        ) : (
          <p className="p-4 text-sm text-muted-foreground">{empty}</p>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [labs, setLabs] = useState<AdminLab[]>([]);
  const [events, setEvents] = useState<LabEvent[]>([]);
  const [credits, setCredits] = useState<CreditTransaction[]>([]);
  const [aws, setAws] = useState<AwsOverview | null>(null);
  const [awsLogs, setAwsLogs] = useState<string>("");
  const [awsLogService, setAwsLogService] = useState<"api" | "worker">("worker");
  const [tab, setTab] = useState<AdminTab>("aws");
  const [isLoading, setIsLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [awsErrorMessage, setAwsErrorMessage] = useState<string | null>(null);

  const loadAdmin = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setAwsErrorMessage(null);

    try {
      const [nextOverview, nextUsers, nextLabs, nextEvents, nextCredits, nextAws] =
        await Promise.allSettled([
          getAdminOverview(),
          getAdminUsers(),
          getAdminLabs(),
          getAdminEvents(),
          getAdminCreditTransactions(),
          getAdminAwsOverview(),
        ]);

      if (nextOverview.status === "fulfilled") setOverview(nextOverview.value);
      if (nextUsers.status === "fulfilled") setUsers(nextUsers.value);
      if (nextLabs.status === "fulfilled") setLabs(nextLabs.value);
      if (nextEvents.status === "fulfilled") setEvents(nextEvents.value);
      if (nextCredits.status === "fulfilled") setCredits(nextCredits.value);

      if (nextAws.status === "fulfilled") {
        setAws(nextAws.value);
      } else {
        setAwsErrorMessage(extractApiErrorMessage(nextAws.reason));
      }

      const firstCoreFailure = [nextOverview, nextUsers, nextLabs, nextEvents, nextCredits].find(
        (result) => result.status === "rejected"
      );
      if (firstCoreFailure?.status === "rejected") {
        setErrorMessage(extractApiErrorMessage(firstCoreFailure.reason));
      }
    } catch (error) {
      setErrorMessage(extractApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadAdmin);
  }, [loadAdmin]);

  const failedLabs = useMemo(
    () => labs.filter((lab) => String(lab.status).toUpperCase() === "FAILED"),
    [labs]
  );

  const recommendations = useMemo(() => {
    if (!aws) return [];
    const items: Array<{ title: string; detail: string; tone: "warning" | "danger" | "default" }> = [];
    const oldestProvision = aws.sqs.provision.oldest_age_seconds ?? 0;
    if (oldestProvision > 300) {
      items.push({
        title: "Provision queue aging",
        detail: `Oldest provision message is ${Math.round(oldestProvision / 60)} minutes old. Check worker concurrency and SQS visibility.`,
        tone: "warning",
      });
    }
    if ((aws.ecs.worker.running ?? 0) < (aws.ecs.worker.desired ?? 0)) {
      items.push({
        title: "Worker capacity degraded",
        detail: "The worker service has fewer running tasks than desired. Check ECS events and task logs.",
        tone: "danger",
      });
    }
    if (aws.alarms.firing > 0) {
      items.push({
        title: "CloudWatch alarms firing",
        detail: `${aws.alarms.firing} alarm${aws.alarms.firing === 1 ? "" : "s"} need attention.`,
        tone: "danger",
      });
    }
    if ((aws.secrets.items ?? []).some((secret) => !secret.rotation_enabled && !secret.name?.includes("/lab/"))) {
      items.push({
        title: "Runtime secret rotation",
        detail: "At least one non-lab Orchestryx secret does not have rotation enabled.",
        tone: "warning",
      });
    }
    if (!aws.load_balancing.load_balancers.length) {
      items.push({
        title: "No load balancer discovered",
        detail: "The overlay did not find an Orchestryx ALB/NLB. Confirm this is expected for the current deployment.",
        tone: "default",
      });
    }
    if (!items.length) {
      items.push({
        title: "Control plane stable",
        detail: "No high-signal operational recommendations from the current AWS snapshot.",
        tone: "default",
      });
    }
    return items.slice(0, 4);
  }, [aws]);

  const loadAwsLogs = useCallback(async (service: "api" | "worker") => {
    setAwsLogService(service);
    try {
      setAwsLogs(await getAdminAwsLogs(service));
    } catch (error) {
      setAwsLogs(extractApiErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    if (tab === "aws" && user?.role === "admin") {
      void Promise.resolve().then(() => loadAwsLogs(awsLogService));
    }
  }, [awsLogService, loadAwsLogs, tab, user?.role]);

  const stopLab = async (instanceId: string) => {
    setActionId(instanceId);
    try {
      await adminStopLab(instanceId);
      toast({ title: "Teardown queued", tone: "success" });
      await loadAdmin();
    } catch (error) {
      toast({
        title: "Could not stop lab",
        description: extractApiErrorMessage(error),
        tone: "error",
      });
    } finally {
      setActionId(null);
    }
  };

  const addCredit = async (targetUser: AdminUser) => {
    setActionId(targetUser.id);
    try {
      await adjustAdminUserCredits(targetUser.id, 5, "Operator credit grant");
      toast({ title: "Credits added", tone: "success" });
      await loadAdmin();
    } catch (error) {
      toast({
        title: "Credit adjustment failed",
        description: extractApiErrorMessage(error),
        tone: "error",
      });
    } finally {
      setActionId(null);
    }
  };

  if (user?.role !== "admin") {
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-border bg-card p-8 text-center">
        <Shield className="mx-auto h-8 w-8 text-muted-foreground" />
        <h1 className="mt-4 text-2xl text-foreground">Admin access required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account is not marked as an Orchestryx administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl text-foreground">Admin Console</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cloud operations, lab lifecycle, users, credits, failures, and provisioning events.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={loadAdmin} disabled={isLoading}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </header>

      {errorMessage ? (
        <div className="rounded-lg border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm text-red-300">
          {errorMessage}
        </div>
      ) : null}

      {isLoading && !overview ? (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Metric icon={Server} label="Active labs" value={overview?.labs.active ?? 0} />
          <Metric icon={Users} label="Users" value={overview?.users.total ?? 0} />
          <Metric icon={Coins} label="Credits outstanding" value={overview?.credits.outstanding_balance.toFixed(1) ?? "0"} />
          <Metric
            icon={Cloud}
            label="AWS lab stacks"
            value={aws?.cloudformation.lab_stacks.length ?? 0}
            tone={(aws?.cloudformation.lab_stacks ?? []).some((stack) => healthTone(stack.status) === "danger") ? "danger" : "default"}
          />
          <Metric
            icon={ListChecks}
            label="SQS queued"
            value={(aws?.sqs.provision.queued ?? 0) + (aws?.sqs.destroy.queued ?? 0)}
            tone={(aws?.sqs.provision.oldest_age_seconds ?? 0) > 300 ? "warning" : "default"}
          />
          <Metric
            icon={AlertTriangle}
            label="Failed labs"
            value={overview?.labs.failed ?? failedLabs.length}
            tone={(overview?.labs.failed ?? failedLabs.length) > 0 ? "danger" : "default"}
          />
        </section>
      )}

      <div className="flex gap-2 overflow-x-auto border-b border-border pb-2">
        {(["aws", "labs", "users", "events", "credits"] as AdminTab[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={cn(
              "h-9 shrink-0 rounded-lg px-3 text-sm capitalize",
              tab === item
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "aws" ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-5"
        >
          {awsErrorMessage ? (
            <div className="flex items-start gap-3 rounded-lg border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="text-foreground">AWS telemetry is unavailable.</p>
                <p className="mt-1 text-muted-foreground">{awsErrorMessage}</p>
              </div>
            </div>
          ) : null}
          {!aws ? (
            awsErrorMessage ? (
              <section className="rounded-lg border border-border bg-card p-6">
                <h2 className="text-xl text-foreground">Cloud overlay could not load</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Core admin data is still available. Check AWS credentials, region, CloudWatch permissions, and the API logs, then refresh the console.
                </p>
              </section>
            ) : (
              <Skeleton className="h-72 w-full" />
            )
          ) : (
            <>
              <section className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="grid gap-6 border-b border-border p-5 xl:grid-cols-[1fr_auto] xl:items-center">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-secondary text-primary">
                        <Cloud className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-2xl text-foreground">Cloud Overlay</h2>
                        <p className="text-sm text-muted-foreground">
                          {aws.region} · ECS cluster {aws.cluster} · live AWS control-plane snapshot
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center sm:min-w-[28rem]">
                    <div className="rounded-lg border border-border bg-secondary/45 p-3">
                      <p className="text-xs text-muted-foreground">Alarms</p>
                      <p className="mt-1 text-2xl text-foreground">{aws.alarms.firing}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-secondary/45 p-3">
                      <p className="text-xs text-muted-foreground">Stacks</p>
                      <p className="mt-1 text-2xl text-foreground">{aws.cloudformation.lab_stacks.length}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-secondary/45 p-3">
                      <p className="text-xs text-muted-foreground">Monthly</p>
                      <p className="mt-1 text-2xl text-foreground">${aws.costs.total.toFixed(2)}</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 p-5 xl:grid-cols-[1.2fr_0.8fr]">
                  <div className="relative overflow-hidden rounded-lg border border-border bg-[#0b0f17] p-4">
                    <div className="absolute left-8 right-8 top-[5.6rem] hidden h-px bg-border xl:block" />
                    <div className="absolute left-1/2 top-[5.6rem] hidden h-[8.7rem] w-px bg-border xl:block" />
                    <div className="grid gap-4 xl:grid-cols-4">
                      <CloudNode icon={Users} title="Cognito" detail={`${aws.cognito.estimated_users ?? 0} users`} status={aws.cognito.status} />
                      <CloudNode icon={Route} title="SQS" detail={`${(aws.sqs.provision.queued ?? 0) + (aws.sqs.destroy.queued ?? 0)} queued`} status={(aws.sqs.provision.oldest_age_seconds ?? 0) > 300 ? "LAGGING" : "OK"} />
                      <CloudNode icon={Server} title="ECS" detail={`${aws.ecs.tasks.length} tasks`} status={aws.ecs.api.rollout_state ?? aws.ecs.api.status} />
                      <CloudNode icon={Database} title="Aurora" detail={aws.aurora.engine_version ?? "database"} status={aws.aurora.status} />
                    </div>
                    <div className="mt-4 grid gap-4 xl:grid-cols-4">
                      <CloudNode icon={Network} title="Network" detail={`${aws.network.subnets.length} subnets`} status={aws.network.error ? "ERROR" : "OK"} />
                      <CloudNode icon={Layers} title="CloudFormation" detail={`${aws.cloudformation.lab_stacks.length} lab stacks`} status={aws.cloudformation.lab_stacks.some((stack) => healthTone(stack.status) === "danger") ? "ATTENTION" : "OK"} />
                      <CloudNode icon={HardDrive} title="EC2 Labs" detail={`${aws.ec2.lab_instances.length} hosts`} status={aws.ec2.lab_instances.some((item) => item.state === "pending") ? "STARTING" : "OK"} />
                      <CloudNode icon={LockKeyhole} title="Secrets" detail={`${aws.secrets.count} tracked`} status={aws.secrets.error ? "ERROR" : "OK"} />
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-secondary/35 p-4">
                    <h3 className="text-lg text-foreground">Operational Recommendations</h3>
                    <div className="mt-4 space-y-3">
                      {recommendations.map((item) => (
                        <div
                          key={item.title}
                          className={cn(
                            "rounded-lg border p-3",
                            item.tone === "danger"
                              ? "border-red-400/30 bg-red-500/10"
                              : item.tone === "warning"
                                ? "border-amber-400/30 bg-amber-500/10"
                                : "border-border bg-card"
                          )}
                        >
                          <p className="text-sm text-foreground">{item.title}</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr]">
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg text-foreground">Service Capacity</h3>
                    <Cpu className="h-4 w-4 text-primary" />
                  </div>
                  <div className="mt-4 grid gap-4">
                    {([
                      ["API", aws.ecs.api, aws.metrics.ecs.api],
                      ["Worker", aws.ecs.worker, aws.metrics.ecs.worker],
                    ] as const).map(([label, service, metrics]) => (
                      <div key={label} className="rounded-lg border border-border bg-secondary/45 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm text-foreground">{label}</p>
                            <p className="mono truncate text-xs text-muted-foreground">{service.task_definition ?? service.error ?? "No task definition"}</p>
                          </div>
                          <HealthPill value={service.rollout_state ?? service.status} />
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                          <span className="text-muted-foreground">Run {service.running ?? 0}</span>
                          <span className="text-muted-foreground">Want {service.desired ?? 0}</span>
                          <span className="text-muted-foreground">Pend {service.pending ?? 0}</span>
                        </div>
                        <div className="mt-4 space-y-3">
                          <UtilBar label="CPU" value={metrics?.CPUUtilization?.average} />
                          <UtilBar label="Memory" value={metrics?.MemoryUtilization?.average} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg text-foreground">Queues</h3>
                    <ListChecks className="h-4 w-4 text-primary" />
                  </div>
                  <div className="mt-4 grid gap-3">
                    {([
                      ["Provision", aws.sqs.provision],
                      ["Destroy", aws.sqs.destroy],
                    ] as Array<[string, AwsQueue]>).map(([label, queue]) => (
                      <div key={label} className="rounded-lg border border-border bg-secondary/45 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-foreground">{label}</span>
                          <span className="text-sm text-muted-foreground">{queue.in_flight ?? 0} in-flight</span>
                        </div>
                        <p className="mt-2 text-3xl text-foreground">{queue.queued ?? 0}</p>
                        <p className="mono mt-1 truncate text-xs text-muted-foreground">{queue.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">oldest {queue.oldest_age_seconds ?? 0}s</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg text-foreground">Cost By Service</h3>
                    <WalletCards className="h-4 w-4 text-primary" />
                  </div>
                  <div className="mt-4 space-y-3">
                    {aws.costs.services.length ? (
                      aws.costs.services.map((service) => {
                        const max = Math.max(...aws.costs.services.map((item) => item.amount), 1);
                        return (
                          <div key={service.service}>
                            <div className="flex items-center justify-between gap-3 text-xs">
                              <span className="truncate text-muted-foreground">{service.service}</span>
                              <span className="text-foreground">${service.amount.toFixed(2)}</span>
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (service.amount / max) * 100)}%` }} />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm text-muted-foreground">{aws.costs.error ?? "Cost Explorer data unavailable."}</p>
                    )}
                  </div>
                </div>
              </section>

              <section className="grid gap-4 xl:grid-cols-4">
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg text-foreground">Images</h3>
                    <Boxes className="h-4 w-4 text-primary" />
                  </div>
                  <div className="mt-4 space-y-3">
                    {([
                      ["API", aws.ecr.api],
                      ["Worker", aws.ecr.worker],
                    ] as Array<[string, AwsEcrImage]>).map(([label, image]) => (
                      <div key={label} className="rounded-lg border border-border bg-secondary/45 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm text-foreground">{label}</span>
                          <HealthPill value={image.status} />
                        </div>
                        <p className="mono mt-2 truncate text-xs text-muted-foreground">{image.repository}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {image.size_mb ?? 0} MB · pushed {fmt(image.pushed_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg text-foreground">Logs</h3>
                    <Terminal className="h-4 w-4 text-primary" />
                  </div>
                  <div className="mt-4 space-y-3">
                    {([
                      ["API", aws.logs.api],
                      ["Worker", aws.logs.worker],
                    ] as Array<[string, AwsLogGroup]>).map(([label, group]) => (
                      <div key={label} className="rounded-lg border border-border bg-secondary/45 p-3">
                        <p className="text-sm text-foreground">{label}</p>
                        <p className="mono mt-1 truncate text-xs text-muted-foreground">{group.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {group.stored_mb ?? 0} MB · latest {fmt(group.latest_event_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg text-foreground">Load Balancing</h3>
                    <Gauge className="h-4 w-4 text-primary" />
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="rounded-lg border border-border bg-secondary/45 p-3">
                      <p className="text-sm text-muted-foreground">Load balancers</p>
                      <p className="mt-1 text-3xl text-foreground">{aws.load_balancing.load_balancers.length}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-secondary/45 p-3">
                      <p className="text-sm text-muted-foreground">Target groups</p>
                      <p className="mt-1 text-3xl text-foreground">{aws.load_balancing.target_groups.length}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg text-foreground">Security</h3>
                    <ShieldCheck className="h-4 w-4 text-primary" />
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="rounded-lg border border-border bg-secondary/45 p-3">
                      <p className="text-sm text-muted-foreground">IAM roles</p>
                      <p className="mt-1 text-3xl text-foreground">{aws.iam.roles.length}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-secondary/45 p-3">
                      <p className="text-sm text-muted-foreground">Secrets</p>
                      <p className="mt-1 text-3xl text-foreground">{aws.secrets.count}</p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 xl:grid-cols-3">
                <ResourceMiniTable
                  title="Lab Stacks"
                  icon={Cloud}
                  empty="No active lab stacks."
                  rows={aws.cloudformation.lab_stacks.map((stack) => ({
                    id: stack.name ?? stack.error ?? "stack",
                    primary: stack.name ?? "Stack unavailable",
                    secondary: fmt(stack.created_at),
                    status: stack.status,
                  }))}
                />
                <ResourceMiniTable
                  title="Lab EC2 Hosts"
                  icon={HardDrive}
                  empty="No tagged lab EC2 instances."
                  rows={aws.ec2.lab_instances.map((instance) => ({
                    id: instance.id ?? instance.error ?? "instance",
                    primary: instance.id ?? "Instance unavailable",
                    secondary: `${instance.type ?? "-"} · ${instance.public_ip ?? "no public IP"} · ${instance.az ?? "-"}`,
                    status: instance.state ?? instance.status,
                  }))}
                />
                <ResourceMiniTable
                  title="Network"
                  icon={Network}
                  empty="No Orchestryx VPC resources discovered."
                  rows={[
                    ...aws.network.vpcs.map((vpc) => ({
                      id: vpc.id ?? "vpc",
                      primary: vpc.id ?? "VPC unavailable",
                      secondary: `${vpc.cidr ?? "-"} · ${aws.network.subnets.filter((subnet) => subnet.vpc_id === vpc.id).length} subnets`,
                      status: vpc.state,
                    })),
                    ...aws.network.security_groups.slice(0, 6).map((group) => ({
                      id: group.id ?? "sg",
                      primary: group.name ?? group.id ?? "Security group",
                      secondary: `${group.ingress_rules ?? 0} ingress · ${group.egress_rules ?? 0} egress`,
                      status: "OK",
                    })),
                  ]}
                />
              </section>

              <section className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg text-foreground">CloudWatch Tail</h3>
                    <p className="text-sm text-muted-foreground">Recent ECS logs without leaving the admin console.</p>
                  </div>
                  <div className="flex gap-2">
                    {(["api", "worker"] as const).map((service) => (
                      <Button
                        key={service}
                        type="button"
                        variant={awsLogService === service ? "primary" : "secondary"}
                        size="sm"
                        onClick={() => loadAwsLogs(service)}
                      >
                        <Terminal className="h-3.5 w-3.5" />
                        {service}
                      </Button>
                    ))}
                  </div>
                </div>
                <pre className="max-h-96 overflow-auto bg-[#06080d] p-4 text-xs leading-6 text-muted-foreground">
                  {awsLogs || "Select a service to load logs."}
                </pre>
              </section>
            </>
          )}
        </motion.div>
      ) : null}

      {tab === "labs" ? (
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          {labs.map((lab) => (
            <div key={lab.instance_id} className="grid gap-3 border-b border-border p-4 last:border-b-0 xl:grid-cols-[1fr_0.7fr_0.9fr_0.9fr_auto] xl:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{lab.template_title}</p>
                <p className="mono truncate text-xs text-muted-foreground">{lab.instance_id}</p>
                <p className="truncate text-xs text-muted-foreground">{lab.owner_email}</p>
              </div>
              <StatusBadge status={lab.status} />
              <div className="text-sm text-muted-foreground">
                <p>{lab.progress}%</p>
                <p className="truncate">{lab.status_message}</p>
              </div>
              <div className="text-xs text-muted-foreground">
                <p>{lab.ec2_public_ip ?? "No host yet"}</p>
                <p>{formatDateTime(lab.started_at)}</p>
              </div>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={actionId === lab.instance_id}
                onClick={() => stopLab(lab.instance_id)}
              >
                <Square className="h-3.5 w-3.5" />
                Stop
              </Button>
            </div>
          ))}
        </section>
      ) : null}

      {tab === "users" ? (
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          {users.map((row) => (
            <div key={row.id} className="grid gap-3 border-b border-border p-4 last:border-b-0 lg:grid-cols-[1fr_0.4fr_0.5fr_0.5fr_auto] lg:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{row.email}</p>
                <p className="mono truncate text-xs text-muted-foreground">{row.id}</p>
              </div>
              <span className="text-sm text-muted-foreground">{row.role}</span>
              <span className="text-sm text-muted-foreground">{row.credits_balance} credits</span>
              <span className="text-sm text-muted-foreground">{row.is_disabled ? "Disabled" : "Active"}</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={actionId === row.id}
                onClick={() => addCredit(row)}
              >
                <Coins className="h-3.5 w-3.5" />
                Add 5
              </Button>
            </div>
          ))}
        </section>
      ) : null}

      {tab === "events" ? (
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          {events.map((event) => (
            <div key={event.id} className="grid gap-2 border-b border-border p-4 last:border-b-0 lg:grid-cols-[0.7fr_0.7fr_1fr_2fr]">
              <span className="text-xs uppercase text-muted-foreground">{event.level}</span>
              <span className="text-xs text-muted-foreground">{event.phase}</span>
              <span className="mono truncate text-xs text-muted-foreground">{event.instance_id}</span>
              <div>
                <p className="text-sm text-foreground">{event.message}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}</p>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {tab === "credits" ? (
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          {credits.map((row) => (
            <div key={row.id} className="grid gap-3 border-b border-border p-4 last:border-b-0 lg:grid-cols-[0.4fr_1fr_2fr_0.8fr]">
              <span className={cn("text-sm", row.delta >= 0 ? "text-green-300" : "text-amber-300")}>
                {row.delta >= 0 ? "+" : ""}{row.delta}
              </span>
              <span className="mono truncate text-xs text-muted-foreground">{row.user_id}</span>
              <span className="text-sm text-foreground">{row.reason}</span>
              <span className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</span>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
