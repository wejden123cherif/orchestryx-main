"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Boxes,
  Clock3,
  Download,
  GitBranch,
  RefreshCw,
  Server,
  ShieldCheck,
  Square,
  WalletCards,
} from "lucide-react";
import { ConfirmActionDialog } from "@/components/platform/confirm-dialog";
import { EmptyState } from "@/components/platform/empty-state";
import { StatusBadge } from "@/components/platform/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/useAuth";
import {
  extractApiErrorMessage,
  getActiveLabs,
  getCatalog,
  getLabConfigDownload,
  stopLab,
} from "@/lib/api";
import type { ActiveLab, LabTemplate, NormalizedLabStatus } from "@/lib/types";
import {
  cn,
  downloadBlob,
  getProvisioningStage,
  getTimeRemaining,
  isLabStatusTerminal,
  isLabStatusTransitional,
  normalizeLabStatus,
} from "@/lib/utils";

type StatTone = "neutral" | "green" | "amber" | "red";

const toneClasses: Record<StatTone, { icon: string; ring: string }> = {
  neutral: { icon: "bg-secondary text-foreground", ring: "" },
  green: { icon: "bg-success/10 text-success", ring: "border-success/15" },
  amber: { icon: "bg-warning/10 text-warning", ring: "border-warning/15" },
  red: { icon: "bg-destructive/10 text-destructive", ring: "border-destructive/15" },
};

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Activity;
  tone?: StatTone;
}) {
  const t = toneClasses[tone];
  return (
    <motion.div
      layout
      whileHover={{ y: -2 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={cn("app-card p-5", t.ring)}
    >
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">{label}</p>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", t.icon)}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="metric-number mt-3 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </motion.div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="app-card p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-4 h-7 w-14" />
            <Skeleton className="mt-3 h-3 w-36" />
          </div>
        ))}
      </div>
      <div className="app-card p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-5 h-28 w-full" />
      </div>
    </div>
  );
}

function statusCounts(labs: ActiveLab[]) {
  return labs.reduce<Record<NormalizedLabStatus, number>>(
    (acc, lab) => { acc[normalizeLabStatus(lab.status)] += 1; return acc; },
    { QUEUED: 0, PROVISIONING: 0, STARTING: 0, READY: 0, DESTROYING: 0, STOPPED: 0, EXPIRED: 0, FAILED: 0 }
  );
}

export default function DashboardPage() {
  const { user, isLoadingUser } = useAuth();
  const { toast } = useToast();
  const [labs, setLabs] = useState<ActiveLab[]>([]);
  const [templates, setTemplates] = useState<LabTemplate[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmStopId, setConfirmStopId] = useState<string | null>(null);

  const loadDashboard = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsInitialLoading(true);
    }
    setErrorMessage(null);
    try {
      const [activeLabs, catalog] = await Promise.all([getActiveLabs(), getCatalog()]);
      setLabs(activeLabs);
      setTemplates(catalog);
    } catch (error) {
      setErrorMessage(extractApiErrorMessage(error));
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(() => loadDashboard()); }, [loadDashboard]);

  useEffect(() => {
    if (!labs.length) return;

    const hasTransitionalLab = labs.some((lab) => isLabStatusTransitional(lab.status));
    const hasLiveLab = labs.some((lab) => !isLabStatusTerminal(lab.status));
    if (!hasLiveLab) return;

    const timeoutId = window.setTimeout(() => {
      void loadDashboard({ silent: true });
    }, hasTransitionalLab ? 5000 : 15000);

    return () => window.clearTimeout(timeoutId);
  }, [labs, loadDashboard]);

  const templateById = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);
  const counts = useMemo(() => statusCounts(labs), [labs]);
  const labsThisMonth = useMemo(() => {
    const now = new Date();
    return labs.filter((lab) => {
      const d = new Date(lab.started_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
  }, [labs]);
  const quickTemplates = useMemo(() => templates.slice(0, 3), [templates]);
  const activeProvisioning = counts.QUEUED + counts.PROVISIONING + counts.STARTING;

  const downloadConfig = async (instanceId: string) => {
    setActionId(instanceId);
    try {
      const { blob, filename } = await getLabConfigDownload(instanceId);
      downloadBlob(new Blob([blob], { type: blob.type || "text/plain;charset=utf-8" }), filename);
      toast({ title: "Access config downloaded", tone: "success" });
    } catch (error) {
      toast({ title: "Config unavailable", description: extractApiErrorMessage(error), tone: "error" });
    } finally {
      setActionId(null);
    }
  };

  const stop = async (instanceId: string) => {
    setActionId(instanceId);
    try {
      await stopLab(instanceId);
      toast({ title: "Destroy requested", tone: "success" });
      await loadDashboard({ silent: true });
    } catch (error) {
      toast({ title: "Destroy failed", description: extractApiErrorMessage(error), tone: "error" });
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Active labs, credits, and quick access to the Orchestryx workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => loadDashboard({ silent: true })} disabled={isRefreshing}>
            <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
            Refresh
          </Button>
          <Link
            href="/builder"
            className={cn(buttonVariants.secondary, "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium")}
          >
            <GitBranch className="h-3.5 w-3.5" />
            Build topology
          </Link>
          <Link
            href="/catalog"
            className={cn(buttonVariants.primary, "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium")}
          >
            <Boxes className="h-3.5 w-3.5" />
            Start lab
          </Link>
        </div>
      </header>

      {errorMessage ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      {isInitialLoading && !labs.length ? (
        <DashboardSkeleton />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Active labs"
              value={String(labs.length)}
              hint={`${counts.READY} ready, ${activeProvisioning} provisioning`}
              icon={Server}
              tone="green"
            />
            <StatCard
              label="Credits balance"
              value={isLoadingUser ? "-" : String(user?.credits_balance ?? 0)}
              hint="Enforced by the API before each launch."
              icon={WalletCards}
            />
            <StatCard
              label="Labs this month"
              value={String(labsThisMonth)}
              hint="Current account activity."
              icon={Activity}
            />
            <StatCard
              label="Needs attention"
              value={String(counts.FAILED + counts.EXPIRED)}
              hint="Failed or expired sessions."
              icon={ShieldCheck}
              tone={counts.FAILED > 0 ? "red" : counts.EXPIRED > 0 ? "amber" : "neutral"}
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1fr_340px]">
            <div className="app-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Active sessions</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Status, VPN access, and teardown controls.
                  </p>
                </div>
                <Link href="/labs" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  All labs
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>

              {labs.length ? (
                <div className="overflow-x-auto">
                  <div className="min-w-[720px]">
                    <div className="grid grid-cols-[1.4fr_0.7fr_0.7fr_0.6fr_0.85fr] gap-3 border-b border-border bg-muted/30 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      <span>Lab</span>
                      <span>Status</span>
                      <span>Time left</span>
                      <span>Progress</span>
                      <span className="text-right">Actions</span>
                    </div>
                    {labs.map((lab) => {
                      const template = templateById.get(lab.template_id);
                      const name = template?.title ?? lab.template_id;
                      const normalized = normalizeLabStatus(lab.status);

                      return (
                        <motion.div
                          key={lab.instance_id}
                          layout
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="grid grid-cols-[1.4fr_0.7fr_0.7fr_0.6fr_0.85fr] items-center gap-3 border-b border-border px-5 py-3.5 text-sm last:border-b-0 hover:bg-muted/20"
                        >
                          <Link href={`/labs/${lab.instance_id}` as Route} className="min-w-0">
                            <span className="block truncate text-[13px] font-medium text-foreground">{name}</span>
                            <span className="mono mt-0.5 block truncate text-[11px] text-muted-foreground">
                              {lab.instance_id}
                            </span>
                          </Link>
                          <StatusBadge status={lab.status} />
                          <span className="text-xs text-muted-foreground">{getTimeRemaining(lab.expires_at)}</span>
                          <div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  normalized === "FAILED" ? "bg-destructive" : "bg-primary"
                                )}
                                style={{ width: `${Math.max(4, Math.min(100, lab.progress))}%` }}
                              />
                            </div>
                            {normalized !== "READY" && (
                              <p className="mt-1 text-[10px] text-muted-foreground">
                                {getProvisioningStage(lab.status, lab.progress)}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Button
                              type="button" size="sm" variant="secondary"
                              className="h-7 rounded-md px-2 text-[11px]"
                              disabled={actionId === lab.instance_id || normalized !== "READY"}
                              title={normalized === "READY" ? "Download WireGuard access config" : "Config available after lab is running"}
                              onClick={() => downloadConfig(lab.instance_id)}
                            >
                              <Download className="h-3 w-3" />
                              VPN
                            </Button>
                            <Button
                              type="button" size="sm" variant="danger"
                              className="h-7 rounded-md px-2 text-[11px]"
                              disabled={actionId === lab.instance_id || ["FAILED", "EXPIRED", "STOPPED"].includes(normalized)}
                              onClick={() => setConfirmStopId(lab.instance_id)}
                            >
                              <Square className="h-3 w-3" />
                              Stop
                            </Button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="px-6 py-10">
                  <EmptyState
                    icon={Server}
                    title="No active labs"
                    description="Start a template from the catalog. Running environments and VPN configuration will appear here."
                    action={
                      <Link
                        href="/catalog"
                        className={cn(buttonVariants.primary, "inline-flex h-9 items-center rounded-lg px-4 text-sm")}
                      >
                        Browse Catalog
                      </Link>
                    }
                  />
                </div>
              )}
            </div>

            <aside className="space-y-4">
              <div className="app-card p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground">Quick launch</h2>
                  <Clock3 className="h-4 w-4 text-muted-foreground/50" />
                </div>
                <div className="mt-4 space-y-2">
                  {quickTemplates.length ? (
                    quickTemplates.map((template) => (
                      <Link
                        key={template.id}
                        href={`/catalog/${template.id}` as Route}
                        className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 p-3 transition hover:border-primary/20 hover:bg-secondary/60"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium text-foreground">{template.title}</span>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {template.difficulty} &middot; {template.credits_cost} credits
                          </span>
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition group-hover:text-primary" />
                      </Link>
                    ))
                  ) : (
                    <p className="py-2 text-xs text-muted-foreground">Templates load from the API.</p>
                  )}
                </div>
              </div>

              <div className="app-card p-5">
                <h2 className="text-sm font-semibold text-foreground">Workspace</h2>
                <div className="mt-3 grid gap-0.5">
                  {[
                    { label: "Browse catalog", href: "/catalog", icon: Boxes },
                    { label: "Manage labs", href: "/labs", icon: Server },
                    { label: "Build topology", href: "/builder", icon: GitBranch },
                    { label: "Account & credits", href: "/account", icon: WalletCards },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href as Route}
                        className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </aside>
          </section>
        </>
      )}

      <ConfirmActionDialog
        open={Boolean(confirmStopId)}
        onOpenChange={(open) => { if (!open) setConfirmStopId(null); }}
        title="Stop lab environment?"
        description="This will queue teardown of the lab. AWS resources will be cleaned up and the session will end."
        confirmLabel="Stop lab"
        loading={Boolean(actionId)}
        onConfirm={() => {
          if (confirmStopId) void stop(confirmStopId);
          setConfirmStopId(null);
        }}
      />
    </div>
  );
}
