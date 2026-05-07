"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Cloud,
  Coins,
  Database,
  HardDrive,
  ListChecks,
  RefreshCw,
  Server,
  Shield,
  Square,
  Terminal,
  Users,
} from "lucide-react";
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
    <div className="rounded-lg border border-border bg-card p-4">
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
    </div>
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

  const loadAdmin = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [nextOverview, nextUsers, nextLabs, nextEvents, nextCredits, nextAws] =
        await Promise.all([
          getAdminOverview(),
          getAdminUsers(),
          getAdminLabs(),
          getAdminEvents(),
          getAdminCreditTransactions(),
          getAdminAwsOverview(),
        ]);
      setOverview(nextOverview);
      setUsers(nextUsers);
      setLabs(nextLabs);
      setEvents(nextEvents);
      setCredits(nextCredits);
      setAws(nextAws);
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
        <div className="space-y-5">
          {!aws ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <>
              <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-lg border border-border bg-card">
                  <div className="border-b border-border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-xl text-foreground">AWS Overlay</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {aws.region} · ECS cluster {aws.cluster}
                        </p>
                      </div>
                      <HealthPill value={aws.alarms.firing > 0 ? "ALARM" : "OK"} />
                    </div>
                  </div>
                  <div className="grid gap-3 p-4 md:grid-cols-2">
                    {([
                      ["API service", aws.ecs.api],
                      ["Worker service", aws.ecs.worker],
                    ] as const).map(([label, service]) => (
                      <div key={label} className="rounded-lg border border-border bg-secondary/45 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm text-muted-foreground">{label}</p>
                            <p className="mt-1 text-lg text-foreground">{service.name}</p>
                          </div>
                          <HealthPill value={service.rollout_state ?? service.status} />
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <p className="text-muted-foreground">Running</p>
                            <p className="text-foreground">{service.running ?? 0}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Desired</p>
                            <p className="text-foreground">{service.desired ?? 0}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Pending</p>
                            <p className="text-foreground">{service.pending ?? 0}</p>
                          </div>
                        </div>
                        <p className="mono mt-3 truncate text-xs text-muted-foreground">
                          {service.task_definition ?? service.error ?? "No task definition"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card">
                  <div className="border-b border-border p-4">
                    <h2 className="text-xl text-foreground">Control Plane Health</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Live AWS service checks from the API task credentials.
                    </p>
                  </div>
                  <div className="divide-y divide-border">
                    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 p-4">
                      <Database className="h-4 w-4 text-primary" />
                      <div className="min-w-0">
                        <p className="text-sm text-foreground">Aurora</p>
                        <p className="truncate text-xs text-muted-foreground">{aws.aurora.endpoint ?? aws.aurora.error}</p>
                      </div>
                      <HealthPill value={aws.aurora.status} />
                    </div>
                    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 p-4">
                      <Users className="h-4 w-4 text-primary" />
                      <div>
                        <p className="text-sm text-foreground">Cognito</p>
                        <p className="text-xs text-muted-foreground">{aws.cognito.estimated_users ?? 0} users · MFA {aws.cognito.mfa ?? "unknown"}</p>
                      </div>
                      <HealthPill value={aws.cognito.status} />
                    </div>
                    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 p-4">
                      <Coins className="h-4 w-4 text-primary" />
                      <div>
                        <p className="text-sm text-foreground">Cost Explorer</p>
                        <p className="text-xs text-muted-foreground">{aws.costs.period}</p>
                      </div>
                      <span className="text-sm text-foreground">
                        ${aws.costs.total.toFixed(2)} {aws.costs.currency}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 xl:grid-cols-3">
                <div className="rounded-lg border border-border bg-card p-4">
                  <h3 className="text-lg text-foreground">Queues</h3>
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
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                  <h3 className="text-lg text-foreground">Images</h3>
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
                  <h3 className="text-lg text-foreground">Logs</h3>
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
              </section>

              <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                <div className="overflow-hidden rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between border-b border-border p-4">
                    <div>
                      <h3 className="text-lg text-foreground">Lab Stacks</h3>
                      <p className="text-sm text-muted-foreground">CloudFormation resources created by lab starts.</p>
                    </div>
                    <Cloud className="h-4 w-4 text-primary" />
                  </div>
                  <div className="max-h-80 overflow-auto">
                    {aws.cloudformation.lab_stacks.length ? (
                      aws.cloudformation.lab_stacks.map((stack) => (
                        <div key={stack.name ?? stack.error} className="grid gap-3 border-b border-border p-4 last:border-b-0 md:grid-cols-[1fr_auto]">
                          <div className="min-w-0">
                            <p className="mono truncate text-sm text-foreground">{stack.name ?? "Stack unavailable"}</p>
                            <p className="text-xs text-muted-foreground">{fmt(stack.created_at)}</p>
                          </div>
                          <HealthPill value={stack.status} />
                        </div>
                      ))
                    ) : (
                      <p className="p-4 text-sm text-muted-foreground">No active lab stacks.</p>
                    )}
                  </div>
                </div>

                <div className="overflow-hidden rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between border-b border-border p-4">
                    <div>
                      <h3 className="text-lg text-foreground">Lab Instances</h3>
                      <p className="text-sm text-muted-foreground">EC2 hosts tagged as Orchestryx lab resources.</p>
                    </div>
                    <HardDrive className="h-4 w-4 text-primary" />
                  </div>
                  <div className="max-h-80 overflow-auto">
                    {aws.ec2.lab_instances.length ? (
                      aws.ec2.lab_instances.map((instance) => (
                        <div key={instance.id ?? instance.error} className="grid gap-3 border-b border-border p-4 last:border-b-0 md:grid-cols-[1fr_auto]">
                          <div className="min-w-0">
                            <p className="mono truncate text-sm text-foreground">{instance.id ?? "Instance unavailable"}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {instance.type ?? "-"} · {instance.public_ip ?? "no public IP"} · {instance.az ?? "-"}
                            </p>
                          </div>
                          <HealthPill value={instance.state ?? instance.status} />
                        </div>
                      ))
                    ) : (
                      <p className="p-4 text-sm text-muted-foreground">No tagged lab EC2 instances.</p>
                    )}
                  </div>
                </div>
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
        </div>
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
