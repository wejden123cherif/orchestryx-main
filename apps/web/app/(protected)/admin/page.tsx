"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  Copy,
  CreditCard,
  Database,
  DollarSign,
  FileText,
  Globe,
  HardDrive,
  Layers,
  Loader2,
  Lock,
  Network,
  RefreshCw,
  Search,
  Server,
  Settings,
  Shield,
  Square,
  Users,
  XCircle,
} from "lucide-react";
import { StatusBadge } from "@/components/platform/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  adjustAdminUserCredits,
  adminExtendLabTtl,
  adminStopLab,
  extractApiErrorMessage,
  getAdminAwsLogs,
  getAdminAwsOverview,
  getAdminCreditTransactions,
  getAdminEvents,
  getAdminLabs,
  getAdminOverview,
  getAdminProvisioningJobs,
  getAdminUsers,
} from "@/lib/api";
import type {
  AdminLab,
  AdminOverview,
  AdminUser,
  AwsInstance,
  AwsOverview,
  AwsSecurityGroup,
  CreditTransaction,
  LabEvent,
  ProvisioningJob,
} from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

// ─── Types ──────────────────────────────────────────────────────────────────

type AdminTab =
  | "overview"
  | "labs"
  | "users"
  | "infra"
  | "billing"
  | "jobs"
  | "logs"
  | "settings";

type DetailPanel =
  | { kind: "lab"; item: AdminLab }
  | { kind: "user"; item: AdminUser }
  | { kind: "instance"; item: AwsInstance }
  | { kind: "sg"; item: AwsSecurityGroup }
  | { kind: "job"; item: ProvisioningJob }
  | null;

type Toast = { id: string; type: "success" | "error" | "warning"; title: string; message: string };
type AwsQuickLink = {
  label: string;
  description: string;
  href: string;
  icon: typeof Activity;
  tone?: "neutral" | "green" | "amber" | "red" | "blue";
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(value?: string | null): string {
  return value ? formatDateTime(value) : "—";
}

function money(value?: number | null): string {
  return typeof value === "number" ? `$${value.toFixed(2)}` : "—";
}

function compact(value?: string | null, chars = 16): string {
  if (!value) return "—";
  return value.length > chars ? `${value.slice(0, chars)}…` : value;
}

function copyText(text: string) {
  void navigator.clipboard.writeText(text);
}

function statusColor(value?: string | null): "green" | "amber" | "red" | "blue" | "neutral" {
  const n = String(value ?? "").toUpperCase();
  if (["FAILED", "ERROR", "ALARM", "HIGH", "ROLLBACK_COMPLETE"].includes(n)) return "red";
  if (["QUEUED", "PROVISIONING", "STARTING", "DESTROYING", "MEDIUM", "LAGGING"].includes(n)) return "amber";
  if (["READY", "RUNNING", "ACTIVE", "OK", "LOW", "LIVE", "CREATE_COMPLETE"].includes(n)) return "green";
  return "neutral";
}

function awsConsoleUrl(region: string, service: string, fragment = ""): string {
  return `https://${region}.console.aws.amazon.com/${service}/home?region=${region}${fragment}`;
}

function encodeConsoleSegment(value?: string | null): string {
  return encodeURIComponent(value ?? "");
}

function buildAwsQuickLinks(aws: AwsOverview | null): AwsQuickLink[] {
  const region = aws?.region ?? "eu-central-1";
  const cluster = aws?.cluster ?? "";
  const ecsBase = `https://${region}.console.aws.amazon.com/ecs/v2/clusters/${encodeConsoleSegment(cluster)}`;
  const apiService = aws?.ecs.api.name;
  const workerService = aws?.ecs.worker.name;
  const auroraId = aws?.aurora.id;
  const firstVpc = aws?.network.vpcs[0];
  const firstSecret = aws?.secrets.items[0];

  return [
    {
      label: "ECS Cluster",
      description: cluster || "Services and tasks",
      href: cluster ? `${ecsBase}/services?region=${region}` : awsConsoleUrl(region, "ecs", "#/clusters"),
      icon: Server,
      tone: "blue",
    },
    {
      label: "API Service",
      description: apiService || "API task service",
      href: cluster && apiService
        ? `${ecsBase}/services/${encodeConsoleSegment(apiService)}/health?region=${region}`
        : awsConsoleUrl(region, "ecs", "#/clusters"),
      icon: Globe,
      tone: statusColor(aws?.ecs.api.status),
    },
    {
      label: "Worker Service",
      description: workerService || "Provisioning workers",
      href: cluster && workerService
        ? `${ecsBase}/services/${encodeConsoleSegment(workerService)}/health?region=${region}`
        : awsConsoleUrl(region, "ecs", "#/clusters"),
      icon: Settings,
      tone: statusColor(aws?.ecs.worker.status),
    },
    {
      label: "Aurora",
      description: auroraId || "Database cluster",
      href: auroraId
        ? awsConsoleUrl(region, "rds", `#database:id=${encodeConsoleSegment(auroraId)};is-cluster=true`)
        : awsConsoleUrl(region, "rds", "#databases:"),
      icon: Database,
      tone: statusColor(aws?.aurora.status),
    },
    {
      label: "CloudWatch Logs",
      description: aws?.logs.api.name || "API logs",
      href: aws?.logs.api.console_url ?? awsConsoleUrl(region, "cloudwatch", "#logsV2:log-groups"),
      icon: FileText,
      tone: "neutral",
    },
    {
      label: "SQS Queues",
      description: `${aws?.sqs.provision.queued ?? 0} queued`,
      href: aws?.sqs.provision.console_url ?? awsConsoleUrl(region, "sqs", "#/queues"),
      icon: Layers,
      tone: (aws?.sqs.provision.queued ?? 0) > 0 ? "amber" : "green",
    },
    {
      label: "EC2 Instances",
      description: `${aws?.ec2.lab_instances.length ?? 0} lab hosts`,
      href: awsConsoleUrl(region, "ec2", "#Instances:"),
      icon: HardDrive,
      tone: "neutral",
    },
    {
      label: "VPC",
      description: firstVpc?.id ?? "Network resources",
      href: firstVpc?.console_url ?? `https://${region}.console.aws.amazon.com/vpcconsole/home?region=${region}#vpcs:`,
      icon: Network,
      tone: "neutral",
    },
    {
      label: "Security Groups",
      description: `${aws?.network.security_groups.length ?? 0} groups`,
      href: awsConsoleUrl(region, "ec2", "#SecurityGroups:"),
      icon: Shield,
      tone: "blue",
    },
    {
      label: "ECR",
      description: aws?.ecr.api.repository || "Container images",
      href: aws?.ecr.api.console_url ?? awsConsoleUrl(region, "ecr", "#/repositories"),
      icon: Cloud,
      tone: statusColor(aws?.ecr.api.status),
    },
    {
      label: "Cognito",
      description: aws?.cognito.id || "User pool",
      href: aws?.cognito.id
        ? `https://${region}.console.aws.amazon.com/cognito/v2/idp/user-pools/${encodeConsoleSegment(aws.cognito.id)}/users?region=${region}`
        : `https://${region}.console.aws.amazon.com/cognito/v2/idp/user-pools?region=${region}`,
      icon: Users,
      tone: statusColor(aws?.cognito.status),
    },
    {
      label: "Secrets",
      description: firstSecret?.name ?? "Runtime secrets",
      href: firstSecret?.console_url ?? awsConsoleUrl(region, "secretsmanager", "#!/listSecrets"),
      icon: Lock,
      tone: "neutral",
    },
    {
      label: "Costs",
      description: money(aws?.costs.total),
      href: `https://${region}.console.aws.amazon.com/costmanagement/home?region=${region}#/cost-explorer`,
      icon: DollarSign,
      tone: "neutral",
    },
  ];
}

// ─── Reusable UI pieces ─────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: typeof Activity;
  tone?: "neutral" | "green" | "amber" | "red" | "blue";
}) {
  const toneStyles = {
    neutral: "bg-secondary/40 text-muted-foreground",
    green: "bg-success/10 text-success",
    amber: "bg-warning/10 text-warning",
    red: "bg-destructive/10 text-destructive",
    blue: "bg-primary/10 text-primary",
  };

  return (
    <div className="app-card flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", toneStyles[tone])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div>
        <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        {sub && <p className="mt-0.5 text-[12px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("app-card overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && <p className="text-[12px] text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function KVRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{children}</span>
    </div>
  );
}

function Toasts({ items, onDismiss }: { items: Toast[]; onDismiss: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg",
            t.type === "success" && "border-success/30 bg-success/10 text-success",
            t.type === "error" && "border-destructive/30 bg-destructive/10 text-destructive",
            t.type === "warning" && "border-warning/30 bg-warning/10 text-warning"
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold">{t.title}</p>
            <p className="text-[12px] opacity-80">{t.message}</p>
          </div>
          <button type="button" onClick={() => onDismiss(t.id)} className="shrink-0 p-0.5 opacity-60 hover:opacity-100">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

function AwsQuickLinksRail({ aws, loading }: { aws: AwsOverview | null; loading: boolean }) {
  const links = useMemo(() => buildAwsQuickLinks(aws), [aws]);
  const primaryLinks = links.slice(0, 6);
  const secondaryLinks = links.slice(6);

  return (
    <aside className="xl:sticky xl:top-20 xl:self-start">
      <section className="app-card overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">AWS Console</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {aws?.region ?? "Region pending"} quick links
              </p>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
        </div>

        <div className="p-3">
          {loading && !aws ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              {primaryLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 transition hover:border-primary/20 hover:bg-secondary/55"
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        link.tone === "green" && "bg-success/10 text-success",
                        link.tone === "amber" && "bg-warning/10 text-warning",
                        link.tone === "red" && "bg-destructive/10 text-destructive",
                        link.tone === "blue" && "bg-primary/10 text-primary",
                        (!link.tone || link.tone === "neutral") && "bg-secondary text-muted-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-foreground">{link.label}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{link.description}</span>
                    </span>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/45 transition group-hover:text-primary" />
                  </a>
                );
              })}
            </div>
          )}

          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-2 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              More services
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {secondaryLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-secondary/25 px-2.5 py-2 text-[11px] font-medium text-muted-foreground transition hover:border-primary/20 hover:bg-secondary hover:text-foreground"
                    title={link.description}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{link.label}</span>
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </aside>
  );
}

// ─── Data Table ─────────────────────────────────────────────────────────────

function DataTable<T>({
  data,
  columns,
  searchPlaceholder = "Search…",
  searchFn,
  pageSize = 10,
  emptyMessage = "No data",
  loading,
}: {
  data: T[];
  columns: {
    key: string;
    header: string;
    cell: (item: T) => React.ReactNode;
    className?: string;
  }[];
  searchPlaceholder?: string;
  searchFn?: (item: T, query: string) => boolean;
  pageSize?: number;
  emptyMessage?: string;
  loading?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!search || !searchFn) return data;
    const q = search.toLowerCase();
    return data.filter((item) => searchFn(item, q));
  }, [data, search, searchFn]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div>
      {searchFn && (
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
          <span className="shrink-0 text-[12px] text-muted-foreground">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      <div className="-mx-5 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn("whitespace-nowrap px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground", col.className)}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((col) => (
                    <td key={col.key} className="px-5 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-10 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              visible.map((item, i) => (
                <tr key={i} className="hover:bg-secondary/30 transition-colors">
                  {columns.map((col) => (
                    <td key={col.key} className={cn("px-5 py-3 text-foreground", col.className)}>
                      {col.cell(item)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
          <span className="text-[12px] text-muted-foreground">
            Page {safePage} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage(safePage + 1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Detail panels (render inside Dialog) ───────────────────────────────────

function LabDetail({ lab, events }: { lab: AdminLab; events: LabEvent[] }) {
  const labEvents = events.filter((e) => e.instance_id === lab.instance_id).slice(0, 10);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-x-8 gap-y-1 divide-y divide-border sm:grid-cols-3">
        <KVRow label="Lab ID">
          <button type="button" onClick={() => copyText(lab.instance_id)} className="inline-flex items-center gap-1 text-primary hover:underline">
            {compact(lab.instance_id, 20)} <Copy className="h-3 w-3" />
          </button>
        </KVRow>
        <KVRow label="Owner">{lab.owner_email}</KVRow>
        <KVRow label="Status"><StatusBadge status={String(lab.status)} /></KVRow>
        <KVRow label="Progress">{lab.progress}%</KVRow>
        <KVRow label="Retries">{lab.retry_count ?? 0}</KVRow>
        <KVRow label="Public IP">{lab.ec2_public_ip ?? "—"}</KVRow>
        <KVRow label="Stack">{lab.cfn_stack_name ?? "—"}</KVRow>
        <KVRow label="Expires">{fmt(lab.expires_at)}</KVRow>
        <KVRow label="Est. cost">{money(lab.estimated_aws_cost)}</KVRow>
      </div>
      {lab.failure_reason ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{lab.failure_reason}</div>
      ) : (
        <div className="rounded-lg border border-border bg-secondary/30 px-4 py-3 text-[13px] text-muted-foreground">{lab.status_message}</div>
      )}
      {labEvents.length > 0 && (
        <div>
          <h4 className="mb-2 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Lifecycle events</h4>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {labEvents.map((e) => (
              <div key={e.id} className="flex items-start gap-3 rounded-lg bg-secondary/20 px-3 py-2 text-[12px]">
                <Badge tone={e.level === "error" ? "red" : e.level === "warning" ? "amber" : "neutral"} className="shrink-0 mt-0.5">{e.level}</Badge>
                <div className="min-w-0 flex-1">
                  <span className="text-muted-foreground">{fmt(e.created_at)}</span>
                  <span className="mx-1.5 text-muted-foreground/40">·</span>
                  <span className="font-medium text-foreground">{e.phase}</span>
                  <p className="text-muted-foreground">{e.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UserDetail({ user, labs }: { user: AdminUser; labs: AdminLab[] }) {
  const userLabs = labs.filter((l) => l.owner_id === user.id);
  return (
    <div className="space-y-4">
      <div className="divide-y divide-border">
        <KVRow label="User ID">
          <button type="button" onClick={() => copyText(user.id)} className="inline-flex items-center gap-1 text-primary hover:underline">
            {compact(user.id, 20)} <Copy className="h-3 w-3" />
          </button>
        </KVRow>
        <KVRow label="Email">{user.email}</KVRow>
        <KVRow label="Role"><Badge tone={user.role === "admin" ? "amber" : "neutral"}>{user.role}</Badge></KVRow>
        <KVRow label="Status"><Badge tone={user.is_disabled ? "red" : "green"}>{user.is_disabled ? "disabled" : "active"}</Badge></KVRow>
        <KVRow label="Credits">{user.credits_balance}</KVRow>
        <KVRow label="Active labs">{user.active_labs ?? 0}</KVRow>
        <KVRow label="Total labs">{user.total_labs ?? 0}</KVRow>
        <KVRow label="Created">{fmt(user.created_at)}</KVRow>
      </div>
      {userLabs.length > 0 && (
        <div>
          <h4 className="mb-2 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Labs ({userLabs.length})</h4>
          <div className="space-y-1">
            {userLabs.slice(0, 5).map((l) => (
              <div key={l.instance_id} className="flex items-center justify-between rounded-lg bg-secondary/20 px-3 py-2 text-[12px]">
                <span className="font-medium text-foreground">{l.template_title}</span>
                <StatusBadge status={String(l.status)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InstanceDetail({ instance, labs }: { instance: AwsInstance; labs: AdminLab[] }) {
  const linkedLab = labs.find(
    (l) => l.instance_id === instance.lab_instance_id || l.cfn_stack_name === instance.stack_name || Boolean(instance.public_ip && l.ec2_public_ip === instance.public_ip)
  );
  return (
    <div className="space-y-4">
      <div className="divide-y divide-border">
        <KVRow label="Instance ID">
          <button type="button" onClick={() => copyText(instance.id ?? "")} className="inline-flex items-center gap-1 text-primary hover:underline">
            {instance.id ?? "—"} <Copy className="h-3 w-3" />
          </button>
        </KVRow>
        <KVRow label="State"><Badge tone={statusColor(instance.state)}>{instance.state ?? "unknown"}</Badge></KVRow>
        <KVRow label="Type">{instance.type ?? "—"}</KVRow>
        <KVRow label="AZ">{instance.az ?? "—"}</KVRow>
        <KVRow label="Public IP">{instance.public_ip ?? "—"}</KVRow>
        <KVRow label="Private IP">{instance.private_ip ?? "—"}</KVRow>
        <KVRow label="Uptime">{instance.uptime_hours ?? 0}h</KVRow>
        <KVRow label="Est. cost">{money(instance.estimated_running_cost)}</KVRow>
      </div>
      {linkedLab ? (
        <div className="rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-[13px] text-foreground">
          Linked to <span className="font-semibold">{linkedLab.template_title}</span> owned by <span className="font-semibold">{linkedLab.owner_email}</span>
          <span className="text-muted-foreground"> · {String(linkedLab.status)} · expires {fmt(linkedLab.expires_at)}</span>
        </div>
      ) : (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-[13px] text-warning">
          No local lab matched this host. Possible orphan — verify before cleanup.
        </div>
      )}
      {instance.console_url && (
        <a href={instance.console_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] text-primary hover:underline">
          Open in AWS Console <ArrowUpRight className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

function SGDetail({ sg }: { sg: AwsSecurityGroup }) {
  return (
    <div className="space-y-4">
      <div className="divide-y divide-border">
        <KVRow label="Group ID">
          <button type="button" onClick={() => copyText(sg.id ?? "")} className="inline-flex items-center gap-1 text-primary hover:underline">
            {sg.id ?? "—"} <Copy className="h-3 w-3" />
          </button>
        </KVRow>
        <KVRow label="VPC">{sg.vpc_id ?? "—"}</KVRow>
        <KVRow label="Risk"><Badge tone={sg.risk_level === "high" ? "red" : sg.risk_level === "medium" ? "amber" : "green"}>{sg.risk_level ?? "low"}</Badge></KVRow>
        <KVRow label="Attached">{sg.attached_count ?? 0}</KVRow>
        <KVRow label="Inbound rules">{sg.ingress_rules ?? 0}</KVRow>
        <KVRow label="Outbound rules">{sg.egress_rules ?? 0}</KVRow>
      </div>
      {(sg.rules ?? []).length > 0 && (
        <div>
          <h4 className="mb-2 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Rules</h4>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {(sg.rules ?? []).map((rule, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg bg-secondary/20 px-3 py-2 text-[12px]">
                <Badge tone={rule.risk === "high" ? "red" : rule.risk === "medium" ? "amber" : "green"} className="shrink-0">{rule.direction}</Badge>
                <div className="min-w-0 flex-1 text-muted-foreground">
                  <span className="font-medium text-foreground">{rule.protocol} {rule.ports}</span>
                  <span className="mx-1 text-muted-foreground/40">→</span>
                  {rule.targets.map((t) => `${t.type}: ${t.value}`).join(", ") || "—"}
                  {rule.explanation && <p className="mt-0.5 text-muted-foreground/70">{rule.explanation}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {sg.console_url && (
        <a href={sg.console_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] text-primary hover:underline">
          Open in AWS Console <ArrowUpRight className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

function JobDetail({ job }: { job: ProvisioningJob }) {
  return (
    <div className="space-y-4">
      <div className="divide-y divide-border">
        <KVRow label="Job ID">
          <button type="button" onClick={() => copyText(job.id)} className="inline-flex items-center gap-1 text-primary hover:underline">
            {compact(job.id, 20)} <Copy className="h-3 w-3" />
          </button>
        </KVRow>
        <KVRow label="Lab">{job.template_title}</KVRow>
        <KVRow label="User">{job.owner_email}</KVRow>
        <KVRow label="Status"><StatusBadge status={String(job.status)} /></KVRow>
        <KVRow label="Duration">{job.duration_hours}h</KVRow>
        <KVRow label="Retries">{job.retries}</KVRow>
        <KVRow label="Stack">{job.resource_ids.cloudformation_stack ?? "—"}</KVRow>
        <KVRow label="Cleanup"><Badge tone={statusColor(job.cleanup_status)}>{job.cleanup_status}</Badge></KVRow>
        <KVRow label="Slow">{job.is_slow ? "Yes" : "No"}</KVRow>
      </div>
      {job.error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{job.error}</div>
      ) : (
        <div className="rounded-lg border border-border bg-secondary/30 px-4 py-3 text-[13px] text-muted-foreground">{job.current_step}</div>
      )}
    </div>
  );
}

// ─── Tab definitions ────────────────────────────────────────────────────────

const tabs: { id: AdminTab; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "labs", label: "Labs", icon: Server },
  { id: "users", label: "Users", icon: Users },
  { id: "infra", label: "Infrastructure", icon: Cloud },
  { id: "billing", label: "Billing", icon: DollarSign },
  { id: "jobs", label: "Jobs", icon: Layers },
  { id: "logs", label: "Logs", icon: FileText },
  { id: "settings", label: "Settings", icon: Settings },
];

// ─── Main admin page ────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [labs, setLabs] = useState<AdminLab[]>([]);
  const [events, setEvents] = useState<LabEvent[]>([]);
  const [credits, setCredits] = useState<CreditTransaction[]>([]);
  const [jobs, setJobs] = useState<ProvisioningJob[]>([]);
  const [aws, setAws] = useState<AwsOverview | null>(null);
  const [logs, setLogs] = useState("");
  const [logService, setLogService] = useState<"api" | "worker">("worker");
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<DetailPanel>(null);
  const [confirmLab, setConfirmLab] = useState<AdminLab | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [coreError, setCoreError] = useState<string | null>(null);
  const [awsWarning, setAwsWarning] = useState<string | null>(null);

  const notify = useCallback((type: Toast["type"], title: string, message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const loadLogs = useCallback(async (service: "api" | "worker") => {
    setLogService(service);
    try {
      setLogs(await getAdminAwsLogs(service));
    } catch (error) {
      setLogs(extractApiErrorMessage(error));
    }
  }, []);

  const loadAdmin = useCallback(async () => {
    setLoading(true);
    setCoreError(null);
    setAwsWarning(null);
    try {
      const [rOverview, rUsers, rLabs, rEvents, rCredits, rJobs, rAws] = await Promise.allSettled([
        getAdminOverview(),
        getAdminUsers(),
        getAdminLabs(),
        getAdminEvents(),
        getAdminCreditTransactions(),
        getAdminProvisioningJobs(),
        getAdminAwsOverview(),
      ]);
      if (rOverview.status === "fulfilled") setOverview(rOverview.value);
      if (rUsers.status === "fulfilled") setUsers(rUsers.value);
      if (rLabs.status === "fulfilled") setLabs(rLabs.value);
      if (rEvents.status === "fulfilled") setEvents(rEvents.value);
      if (rCredits.status === "fulfilled") setCredits(rCredits.value);
      if (rJobs.status === "fulfilled") setJobs(rJobs.value);
      if (rAws.status === "fulfilled") setAws(rAws.value);
      else setAwsWarning(extractApiErrorMessage(rAws.reason));

      const coreFailure = [rOverview, rUsers, rLabs, rEvents, rCredits, rJobs].find((r) => r.status === "rejected");
      if (coreFailure?.status === "rejected") setCoreError(extractApiErrorMessage(coreFailure.reason));
    } catch (error) {
      setCoreError(extractApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadAdmin);
  }, [loadAdmin]);

  useEffect(() => {
    if (activeTab === "logs") void Promise.resolve().then(() => loadLogs(logService));
  }, [activeTab, loadLogs, logService]);

  const stopLab = async () => {
    if (!confirmLab) return;
    setActionId(confirmLab.instance_id);
    try {
      await adminStopLab(confirmLab.instance_id);
      notify("success", "Lab stop requested", `Teardown queued for ${confirmLab.template_title}`);
      setConfirmLab(null);
      await loadAdmin();
    } catch (error) {
      notify("error", "Could not stop lab", extractApiErrorMessage(error));
    } finally {
      setActionId(null);
    }
  };

  const extendLab = async (lab: AdminLab, hours: number) => {
    setActionId(lab.instance_id);
    try {
      await adminExtendLabTtl(lab.instance_id, hours);
      notify("success", "TTL extended", `${lab.template_title} extended by ${hours}h`);
      await loadAdmin();
    } catch (error) {
      notify("error", "TTL extension failed", extractApiErrorMessage(error));
    } finally {
      setActionId(null);
    }
  };

  const addCredit = async (row: AdminUser) => {
    setActionId(row.id);
    try {
      await adjustAdminUserCredits(row.id, 5, "Operator credit grant");
      notify("success", "Credits updated", `Added 5 credits to ${row.email}`);
      await loadAdmin();
    } catch (error) {
      notify("error", "Credit adjustment failed", extractApiErrorMessage(error));
    } finally {
      setActionId(null);
    }
  };

  // ── Derived data ──

  const instances = aws?.ec2.lab_instances ?? [];
  const securityGroups = aws?.network.security_groups ?? [];
  const highRiskGroups = securityGroups.filter((g) => g.risk_level === "high").length;
  const runningInstances = instances.filter((i) => i.state === "running").length;
  const slowJobs = jobs.filter((j) => j.is_slow).length;
  const activeUsers = users.filter((u) => (u.active_labs ?? 0) > 0).length;

  // ── Access guard ──

  if (user?.role !== "admin") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="app-card max-w-sm p-8 text-center">
          <Shield className="mx-auto h-10 w-10 text-destructive/60" />
          <h2 className="mt-4 text-lg font-semibold text-foreground">Admin access required</h2>
          <p className="mt-2 text-[13px] text-muted-foreground">Your account is not marked as an Orchestryx administrator.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Admin Console</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Cloud operations, labs, users, billing, and infrastructure.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={loadAdmin} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      {/* Errors */}
      {coreError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">
          <strong>API Error:</strong> {coreError}
        </div>
      )}
      {awsWarning && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-[13px] text-warning">
          <strong>AWS Telemetry:</strong> {awsWarning}
        </div>
      )}

      {/* Tabs */}
      <div className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex items-center gap-1 border-b border-border">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-[13px] font-medium transition-colors",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <main className="min-w-0 space-y-6">
          {/* ═══ OVERVIEW ═══ */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard icon={Server} label="Active labs" value={overview?.labs.active ?? 0} sub={`${overview?.labs.failed ?? 0} failed, ${overview?.labs.queued ?? 0} queued`} tone="blue" />
                <MetricCard icon={HardDrive} label="Running compute" value={runningInstances} sub={`${instances.length} tagged hosts`} tone="green" />
                <MetricCard icon={Shield} label="Security exposure" value={highRiskGroups} sub="high-risk groups" tone={highRiskGroups > 0 ? "red" : "green"} />
                <MetricCard icon={DollarSign} label="Period spend" value={money(aws?.costs.total)} sub={`${slowJobs} slow jobs · ${activeUsers} active users`} tone="neutral" />
              </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="Operator findings" description="Automated health checks">
              <div className="space-y-3">
                {highRiskGroups > 0 ? (
                  <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <p className="text-[13px] text-destructive">High-risk security groups expose broad access. Inspect rules in Infrastructure.</p>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-lg border border-success/20 bg-success/5 px-4 py-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <p className="text-[13px] text-success">No high-risk security group rules detected.</p>
                  </div>
                )}
                {slowJobs > 0 && (
                  <div className="flex items-start gap-3 rounded-lg border border-warning/20 bg-warning/5 px-4 py-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <p className="text-[13px] text-warning">Slow provisioning jobs present. Check the Jobs tab.</p>
                  </div>
                )}
                {labs.some((l) => l.cleanup_required) && (
                  <div className="flex items-start gap-3 rounded-lg border border-warning/20 bg-warning/5 px-4 py-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <p className="text-[13px] text-warning">Labs need cleanup verification to prevent orphaned spend.</p>
                  </div>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Quick stats">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Active labs", value: `${overview?.labs.active ?? 0} active, ${overview?.labs.failed ?? 0} failed` },
                  { label: "Running compute", value: `${runningInstances} EC2 hosts` },
                  { label: "Estimated spend", value: `${money(aws?.costs.total)} (${aws?.costs.period ?? "—"})` },
                  { label: "Active users", value: `${activeUsers} consuming capacity` },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border border-border bg-secondary/30 p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{s.label}</p>
                    <p className="mt-1 text-[13px] font-medium text-foreground">{s.value}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
            </div>
          )}

      {/* ═══ LABS ═══ */}
          {activeTab === "labs" && (
        <SectionCard title="Labs" description="Lab sessions with lifecycle, TTL, cost, and admin actions">
          <DataTable
            data={labs}
            loading={loading}
            searchPlaceholder="Search labs by name, owner, status, IP…"
            searchFn={(item, q) =>
              [item.instance_id, item.template_title, item.owner_email, String(item.status), item.ec2_public_ip, item.cfn_stack_name]
                .join(" ")
                .toLowerCase()
                .includes(q)
            }
            emptyMessage="No lab sessions found"
            columns={[
              {
                key: "lab",
                header: "Lab",
                cell: (item) => (
                  <button type="button" onClick={() => setDetail({ kind: "lab", item })} className="font-medium text-primary hover:underline">
                    {item.template_title}
                  </button>
                ),
              },
              { key: "owner", header: "Owner", cell: (item) => item.owner_email },
              { key: "status", header: "Status", cell: (item) => <StatusBadge status={String(item.status)} /> },
              { key: "created", header: "Created", cell: (item) => fmt(item.started_at) },
              { key: "ttl", header: "Expires", cell: (item) => fmt(item.expires_at) },
              { key: "ip", header: "Public IP", cell: (item) => item.ec2_public_ip ?? "—" },
              { key: "cost", header: "Est. cost", cell: (item) => money(item.estimated_aws_cost) },
              {
                key: "health",
                header: "Health",
                cell: (item) =>
                  item.cleanup_required ? (
                    <Badge tone="amber">cleanup</Badge>
                  ) : (
                    <Badge tone="green">tracked</Badge>
                  ),
              },
              {
                key: "actions",
                header: "",
                className: "w-1",
                cell: (item) => (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="Extend TTL by 2h"
                      disabled={actionId === item.instance_id}
                      onClick={() => void extendLab(item, 2)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
                    >
                      <Clock className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Force stop"
                      disabled={actionId === item.instance_id}
                      onClick={() => setConfirmLab(item)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                    >
                      <Square className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </SectionCard>
          )}

      {/* ═══ USERS ═══ */}
          {activeTab === "users" && (
        <SectionCard title="Users" description="Accounts, roles, credits, and activity">
          <DataTable
            data={users}
            loading={loading}
            searchPlaceholder="Search users by email, role…"
            searchFn={(item, q) => [item.id, item.email, item.role, item.subscription_tier].join(" ").toLowerCase().includes(q)}
            emptyMessage="No users found"
            columns={[
              {
                key: "email",
                header: "Email",
                cell: (item) => (
                  <button type="button" onClick={() => setDetail({ kind: "user", item })} className="font-medium text-primary hover:underline">
                    {item.email}
                  </button>
                ),
              },
              { key: "role", header: "Role", cell: (item) => <Badge tone={item.role === "admin" ? "amber" : "neutral"}>{item.role}</Badge> },
              {
                key: "status",
                header: "Status",
                cell: (item) => <Badge tone={item.is_disabled ? "red" : "green"}>{item.is_disabled ? "disabled" : "active"}</Badge>,
              },
              { key: "credits", header: "Credits", cell: (item) => String(item.credits_balance) },
              { key: "active", header: "Active labs", cell: (item) => String(item.active_labs ?? 0) },
              { key: "total", header: "Total labs", cell: (item) => String(item.total_labs ?? 0) },
              {
                key: "spend",
                header: "Est. spend",
                cell: (item) => money(labs.filter((l) => l.owner_id === item.id).reduce((s, l) => s + (l.estimated_aws_cost ?? 0), 0)),
              },
              {
                key: "actions",
                header: "",
                className: "w-1",
                cell: (item) => (
                  <button
                    type="button"
                    title="Add 5 credits"
                    disabled={actionId === item.id}
                    onClick={() => void addCredit(item)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                  </button>
                ),
              },
            ]}
          />
        </SectionCard>
          )}

      {/* ═══ INFRASTRUCTURE ═══ */}
          {activeTab === "infra" && (
        <div className="space-y-6">
          {/* Compute */}
          <SectionCard title="EC2 Compute" description="Tagged Orchestryx lab hosts">
            <DataTable
              data={instances}
              loading={loading}
              searchPlaceholder="Search instances by name, ID, IP, state…"
              searchFn={(item, q) =>
                [item.id, item.name, item.public_ip, item.private_ip, item.lab_instance_id, item.state, item.az].join(" ").toLowerCase().includes(q)
              }
              emptyMessage="No EC2 instances"
              columns={[
                {
                  key: "name",
                  header: "Name",
                  cell: (item) => (
                    <button type="button" onClick={() => setDetail({ kind: "instance", item })} className="font-medium text-primary hover:underline">
                      {item.name ?? item.id ?? "—"}
                    </button>
                  ),
                },
                { key: "state", header: "State", cell: (item) => <Badge tone={statusColor(item.state)}>{item.state ?? "—"}</Badge> },
                { key: "type", header: "Type", cell: (item) => item.type ?? "—" },
                { key: "az", header: "AZ", cell: (item) => item.az ?? "—" },
                { key: "ip", header: "Public IP", cell: (item) => item.public_ip ?? "—" },
                { key: "lab", header: "Linked lab", cell: (item) => compact(item.lab_instance_id) },
                {
                  key: "owner",
                  header: "Owner",
                  cell: (item) =>
                    labs.find((l) => l.instance_id === item.lab_instance_id || l.ec2_public_ip === item.public_ip)?.owner_email ?? "—",
                },
                { key: "uptime", header: "Uptime", cell: (item) => `${item.uptime_hours ?? 0}h` },
                { key: "cost", header: "Est. cost", cell: (item) => money(item.estimated_running_cost) },
              ]}
            />
          </SectionCard>

          {/* Networking */}
          <SectionCard title="Networking" description="VPCs, subnets, and load balancing">
            <div className="space-y-4">
              {(aws?.network.vpcs ?? []).length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {(aws?.network.vpcs ?? []).map((vpc) => (
                    <div key={vpc.id} className="rounded-lg border border-border bg-secondary/20 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-medium text-foreground">{vpc.id}</span>
                        {vpc.console_url && (
                          <a href={vpc.console_url} target="_blank" rel="noreferrer" className="text-primary hover:text-primary/80">
                            <ArrowUpRight className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      <p className="mt-1 text-[12px] text-muted-foreground">CIDR: {vpc.cidr ?? "—"} · {vpc.is_default ? "default" : "custom"}</p>
                    </div>
                  ))}
                </div>
              )}
              {(aws?.network.subnets ?? []).length > 0 && (
                <div className="-mx-5 overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-border bg-secondary/30">
                        <th className="px-5 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Subnet ID</th>
                        <th className="px-5 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">VPC</th>
                        <th className="px-5 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">AZ</th>
                        <th className="px-5 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">CIDR</th>
                        <th className="px-5 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Avail IPs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(aws?.network.subnets ?? []).map((s) => (
                        <tr key={s.id} className="hover:bg-secondary/30">
                          <td className="px-5 py-2.5 text-foreground">
                            {s.console_url ? (
                              <a href={s.console_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{s.id}</a>
                            ) : s.id}
                          </td>
                          <td className="px-5 py-2.5 text-muted-foreground">{s.vpc_id}</td>
                          <td className="px-5 py-2.5 text-muted-foreground">{s.az}</td>
                          <td className="px-5 py-2.5 text-muted-foreground">{s.cidr}</td>
                          <td className="px-5 py-2.5 text-muted-foreground">{s.available_ips}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="grid gap-4 lg:grid-cols-2">
                {(aws?.load_balancing.load_balancers ?? []).length > 0 && (
                  <div>
                    <h4 className="mb-2 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Load balancers</h4>
                    <div className="space-y-2">
                      {(aws?.load_balancing.load_balancers ?? []).map((lb) => (
                        <div key={lb.arn ?? lb.name} className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-4 py-2.5">
                          <div>
                            <span className="text-[13px] font-medium text-foreground">{lb.name}</span>
                            <p className="text-[12px] text-muted-foreground">{lb.scheme} · <Badge tone={statusColor(lb.state)}>{lb.state ?? "—"}</Badge></p>
                          </div>
                          {lb.console_url && (
                            <a href={lb.console_url} target="_blank" rel="noreferrer" className="text-primary"><ArrowUpRight className="h-3.5 w-3.5" /></a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(aws?.load_balancing.target_groups ?? []).length > 0 && (
                  <div>
                    <h4 className="mb-2 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Target groups</h4>
                    <div className="space-y-2">
                      {(aws?.load_balancing.target_groups ?? []).map((tg) => (
                        <div key={tg.arn ?? tg.name} className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-4 py-2.5">
                          <div>
                            <span className="text-[13px] font-medium text-foreground">{tg.name}</span>
                            <p className="text-[12px] text-muted-foreground">{tg.protocol}:{tg.port} · {tg.target_type}</p>
                          </div>
                          {tg.console_url && (
                            <a href={tg.console_url} target="_blank" rel="noreferrer" className="text-primary"><ArrowUpRight className="h-3.5 w-3.5" /></a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Security groups */}
          <SectionCard title="Security Groups" description="Rule-level debugger with risk classification">
            <DataTable
              data={securityGroups}
              loading={loading}
              searchPlaceholder="Search by name, ID, risk…"
              searchFn={(item, q) => [item.id, item.name, item.description, item.vpc_id, item.risk_level].join(" ").toLowerCase().includes(q)}
              emptyMessage="No security groups"
              columns={[
                {
                  key: "name",
                  header: "Security group",
                  cell: (item) => (
                    <button type="button" onClick={() => setDetail({ kind: "sg", item })} className="font-medium text-primary hover:underline">
                      {item.name ?? item.id ?? "—"}
                    </button>
                  ),
                },
                { key: "vpc", header: "VPC", cell: (item) => item.vpc_id ?? "—" },
                { key: "attached", header: "Attached", cell: (item) => String(item.attached_count ?? 0) },
                { key: "inbound", header: "Inbound", cell: (item) => String(item.ingress_rules ?? 0) },
                { key: "outbound", header: "Outbound", cell: (item) => String(item.egress_rules ?? 0) },
                {
                  key: "risk",
                  header: "Risk",
                  cell: (item) => <Badge tone={item.risk_level === "high" ? "red" : item.risk_level === "medium" ? "amber" : "green"}>{item.risk_level ?? "low"}</Badge>,
                },
              ]}
            />
          </SectionCard>

          {/* Storage */}
          <SectionCard title="Storage & Secrets" description="ECR images and Secrets Manager">
            <div className="space-y-4">
              {([aws?.ecr.api, aws?.ecr.worker].filter(Boolean) as NonNullable<typeof aws>["ecr"]["api"][]).length > 0 && (
                <div>
                  <h4 className="mb-2 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">ECR images</h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[aws?.ecr.api, aws?.ecr.worker].filter(Boolean).map((img) => (
                      <div key={img!.repository} className="rounded-lg border border-border bg-secondary/20 p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[13px] font-medium text-foreground">{img!.repository}</span>
                          <Badge tone={statusColor(img!.status)}>{img!.status}</Badge>
                        </div>
                        <p className="mt-1 text-[12px] text-muted-foreground">
                          {img!.size_mb ?? 0} MB · Pushed {fmt(img!.pushed_at)} · Tags: {img!.tags?.join(", ") ?? "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(aws?.secrets.items ?? []).length > 0 && (
                <div>
                  <h4 className="mb-2 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Secrets Manager</h4>
                  <div className="space-y-2">
                    {(aws?.secrets.items ?? []).map((s) => (
                      <div key={s.name} className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-4 py-2.5">
                        <div>
                          <span className="text-[13px] font-medium text-foreground">{s.name}</span>
                          <p className="text-[12px] text-muted-foreground">
                            Changed {fmt(s.last_changed_at)} · Rotation: {s.rotation_enabled ? "enabled" : "disabled"}
                          </p>
                        </div>
                        {s.console_url && (
                          <a href={s.console_url} target="_blank" rel="noreferrer" className="text-primary"><ArrowUpRight className="h-3.5 w-3.5" /></a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </SectionCard>
        </div>
          )}

      {/* ═══ BILLING ═══ */}
          {activeTab === "billing" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard icon={DollarSign} label="Cost Explorer" value={money(aws?.costs.total)} sub={aws?.costs.period ?? "—"} tone="blue" />
            <MetricCard
              icon={HardDrive}
              label="Running EC2 cost"
              value={money(instances.reduce((s, i) => s + (i.estimated_running_cost ?? 0), 0))}
              tone="neutral"
            />
            <MetricCard icon={CreditCard} label="Outstanding credits" value={overview?.credits.outstanding_balance.toFixed(1) ?? "0"} tone="neutral" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="Spend per AWS service">
              {(aws?.costs.services ?? []).length > 0 ? (
                <div className="divide-y divide-border">
                  {(aws?.costs.services ?? []).map((s) => (
                    <div key={s.service} className="flex items-center justify-between py-2.5 text-[13px]">
                      <span className="text-foreground">{s.service}</span>
                      <span className="font-medium tabular-nums text-foreground">{money(s.amount)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-muted-foreground">No cost data available.</p>
              )}
            </SectionCard>

            <SectionCard title="Spend per lab">
              {labs.length > 0 ? (
                <div className="divide-y divide-border">
                  {labs.slice(0, 15).map((l) => (
                    <div key={l.instance_id} className="flex items-center justify-between py-2.5 text-[13px]">
                      <div className="min-w-0">
                        <span className="font-medium text-foreground">{l.template_title}</span>
                        <span className="ml-2 text-muted-foreground">{l.owner_email}</span>
                      </div>
                      <span className="shrink-0 font-medium tabular-nums text-foreground">{money(l.estimated_aws_cost)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-muted-foreground">No labs to display.</p>
              )}
            </SectionCard>
          </div>

          <SectionCard title="Credit transactions" description="Append-only credit ledger">
            <DataTable
              data={credits}
              loading={loading}
              searchPlaceholder="Search by user, reason…"
              searchFn={(item, q) => [item.user_id, item.reason].join(" ").toLowerCase().includes(q)}
              emptyMessage="No credit transactions"
              columns={[
                {
                  key: "delta",
                  header: "Delta",
                  cell: (item) => (
                    <span className={cn("font-medium tabular-nums", item.delta >= 0 ? "text-success" : "text-destructive")}>
                      {item.delta >= 0 ? `+${item.delta}` : item.delta}
                    </span>
                  ),
                },
                { key: "user", header: "User ID", cell: (item) => compact(item.user_id, 20) },
                { key: "reason", header: "Reason", cell: (item) => item.reason },
                { key: "created", header: "Created", cell: (item) => fmt(item.created_at) },
              ]}
            />
          </SectionCard>
        </div>
          )}

      {/* ═══ JOBS ═══ */}
          {activeTab === "jobs" && (
        <SectionCard title="Provisioning Jobs" description="Lifecycle jobs with steps, retries, errors, and cleanup">
          <DataTable
            data={jobs}
            loading={loading}
            searchPlaceholder="Search by lab, user, status, error…"
            searchFn={(item, q) =>
              [item.id, item.template_title, item.owner_email, String(item.status), item.current_step, item.error, item.cleanup_status]
                .join(" ")
                .toLowerCase()
                .includes(q)
            }
            emptyMessage="No provisioning jobs"
            columns={[
              {
                key: "id",
                header: "Job ID",
                cell: (item) => (
                  <button type="button" onClick={() => setDetail({ kind: "job", item })} className="font-medium text-primary hover:underline">
                    {compact(item.id)}
                  </button>
                ),
              },
              { key: "lab", header: "Lab", cell: (item) => item.template_title },
              { key: "user", header: "User", cell: (item) => item.owner_email },
              { key: "status", header: "Status", cell: (item) => <StatusBadge status={String(item.status)} /> },
              { key: "step", header: "Current step", cell: (item) => item.current_step },
              { key: "duration", header: "Duration", cell: (item) => `${item.duration_hours}h` },
              { key: "retries", header: "Retries", cell: (item) => String(item.retries) },
              { key: "error", header: "Error", cell: (item) => item.error ? <span className="text-destructive">{compact(item.error, 30)}</span> : "—" },
              {
                key: "cleanup",
                header: "Cleanup",
                cell: (item) => <Badge tone={statusColor(item.cleanup_status)}>{item.cleanup_status}</Badge>,
              },
            ]}
          />
        </SectionCard>
          )}

      {/* ═══ LOGS ═══ */}
          {activeTab === "logs" && (
        <SectionCard
          title="CloudWatch Log Tail"
          description="Live tail from ECS services"
          actions={
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/60 p-0.5">
                {(["worker", "api"] as const).map((svc) => (
                  <button
                    key={svc}
                    type="button"
                    onClick={() => void loadLogs(svc)}
                    className={cn(
                      "rounded-md px-3 py-1 text-[12px] font-medium transition",
                      logService === svc ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {svc}
                  </button>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={() => copyText(logs)} title="Copy logs">
                <Copy className="h-3.5 w-3.5" />
              </Button>
              {(logService === "api" ? aws?.logs.api.console_url : aws?.logs.worker.console_url) && (
                <a
                  href={(logService === "api" ? aws?.logs.api.console_url : aws?.logs.worker.console_url)!}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
                >
                  CloudWatch <ArrowUpRight className="h-3 w-3" />
                </a>
              )}
            </div>
          }
        >
          <pre className="max-h-[600px] overflow-auto rounded-lg border border-border bg-[var(--color-card)] p-4 font-mono text-[12px] leading-relaxed text-foreground">
            {logs || "Select a service to load logs."}
          </pre>
        </SectionCard>
          )}

      {/* ═══ SETTINGS ═══ */}
          {activeTab === "settings" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="Telemetry inputs" description="Environment and AWS configuration">
            <div className="divide-y divide-border">
              <KVRow label="Environment">{process.env.NODE_ENV ?? "development"}</KVRow>
              <KVRow label="API URL">{process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}</KVRow>
              <KVRow label="AWS region">{aws?.region ?? "—"}</KVRow>
              <KVRow label="ECS cluster">{aws?.cluster ?? "—"}</KVRow>
              <KVRow label="API log group">{aws?.logs.api.name ?? "—"}</KVRow>
              <KVRow label="Worker log group">{aws?.logs.worker.name ?? "—"}</KVRow>
            </div>
          </SectionCard>

          <SectionCard title="Implemented actions" description="Backend action status">
            <div className="space-y-3">
              {[
                { ok: true, text: "Lab stop queues real backend teardown." },
                { ok: true, text: "TTL extension writes real lab event/state." },
                { ok: true, text: "Credit grants write the credit ledger." },
                { ok: false, text: "EC2 reboot/terminate and SG remediation are TODO." },
              ].map((a) => (
                <div key={a.text} className="flex items-start gap-3">
                  {a.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  )}
                  <span className="text-[13px] text-foreground">{a.text}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
          )}
        </main>

        <AwsQuickLinksRail aws={aws} loading={loading} />
      </div>

      {/* ─── Detail dialog ─── */}
      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[85vh] w-[min(calc(100vw-2rem),48rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detail?.kind === "lab" && `Lab: ${detail.item.template_title}`}
              {detail?.kind === "user" && `User: ${detail.item.email}`}
              {detail?.kind === "instance" && `EC2: ${detail.item.name ?? detail.item.id}`}
              {detail?.kind === "sg" && `SG: ${detail.item.name ?? detail.item.id}`}
              {detail?.kind === "job" && `Job: ${detail.item.template_title}`}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            {detail?.kind === "lab" && <LabDetail lab={detail.item} events={events} />}
            {detail?.kind === "user" && <UserDetail user={detail.item} labs={labs} />}
            {detail?.kind === "instance" && <InstanceDetail instance={detail.item} labs={labs} />}
            {detail?.kind === "sg" && <SGDetail sg={detail.item} />}
            {detail?.kind === "job" && <JobDetail job={detail.item} />}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Stop lab confirmation ─── */}
      <Dialog open={confirmLab !== null} onOpenChange={(open) => !open && setConfirmLab(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Force stop lab?</DialogTitle>
            <DialogDescription>
              This marks the lab as destroying and queues the worker teardown flow.
            </DialogDescription>
          </DialogHeader>
          {confirmLab && (
            <div className="mt-4 divide-y divide-border rounded-lg border border-border bg-secondary/30 p-4">
              <KVRow label="Lab">{confirmLab.template_title}</KVRow>
              <KVRow label="Instance ID">{compact(confirmLab.instance_id, 24)}</KVRow>
              <KVRow label="Owner">{confirmLab.owner_email}</KVRow>
              <KVRow label="Status"><StatusBadge status={String(confirmLab.status)} /></KVRow>
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmLab(null)}>Cancel</Button>
            <Button variant="danger" disabled={Boolean(actionId)} onClick={() => void stopLab()}>
              {actionId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Queue teardown
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toasts items={toasts} onDismiss={dismissToast} />
    </div>
  );
}
