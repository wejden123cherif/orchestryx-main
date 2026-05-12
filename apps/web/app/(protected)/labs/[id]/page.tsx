"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Loader2,
  Network,
  RefreshCw,
  ShieldCheck,
  Square,
  Terminal,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ConfirmActionDialog } from "@/components/platform/confirm-dialog";
import { StatusBadge } from "@/components/platform/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  extractApiErrorMessage,
  getLabConfigDownload,
  getLabEvents,
  getLabStatus,
  stopLab,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type { LabEvent, LabStatusResponse, NormalizedLabStatus } from "@/lib/types";
import {
  cn,
  downloadBlob,
  formatDateTime,
  getProvisioningStage,
  getTimeRemaining,
  isLabStatusTerminal,
  isLabStatusTransitional,
  normalizeLabStatus,
} from "@/lib/utils";

type LifecycleStep = {
  key: string;
  label: string;
  icon: typeof Clock3;
};

type ActivityNotice = {
  id: string;
  title: string;
  message: string;
  tone: "info" | "success" | "error";
  createdAt: Date;
};

const lifecycleSteps: LifecycleStep[] = [
  { key: "queued", label: "Preparing", icon: Clock3 },
  { key: "starting", label: "Container", icon: Loader2 },
  { key: "access", label: "Access", icon: Network },
  { key: "ready", label: "Ready", icon: CheckCircle2 },
];

function LabDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-36" />
      <div className="app-card overflow-hidden p-6">
        <div className="flex items-center gap-4">
          <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-border bg-secondary">
            <span className="absolute inset-x-2 top-2 h-1 rounded-full bg-primary/30" />
            <span className="absolute inset-x-2 top-5 h-1 rounded-full bg-primary/45" />
            <span className="absolute inset-x-2 top-8 h-1 rounded-full bg-primary/20" />
            <span className="absolute inset-0 lab-scan" />
          </div>
          <div className="min-w-0 flex-1">
            <Skeleton className="h-6 w-64 max-w-full" />
            <Skeleton className="mt-3 h-4 w-96 max-w-full" />
          </div>
        </div>
        <div className="relative mt-6 h-1 overflow-hidden rounded-full bg-secondary">
          <span className="progress-indeterminate" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}

function stepState(status: NormalizedLabStatus, index: number, progress: number) {
  if (status === "FAILED") return index <= Math.max(0, Math.floor(progress / 30)) ? "failed" : "pending";
  if (status === "STOPPED" || status === "EXPIRED") return index === 0 ? "done" : "pending";
  if (status === "READY") return "done";
  if (status === "DESTROYING") return index < 3 ? "done" : "active";
  if (status === "QUEUED") return index === 0 ? "active" : "pending";
  if (status === "PROVISIONING") return index === 0 ? "done" : index === 1 ? "active" : "pending";
  if (status === "STARTING") return index < 2 ? "done" : index === 2 ? "active" : "pending";
  return "pending";
}

function LifecyclePanel({ lab }: { lab: LabStatusResponse }) {
  const status = normalizeLabStatus(lab.status);
  const progress = Math.max(0, Math.min(100, lab.progress ?? 0));

  return (
    <section className="app-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Launch</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {getProvisioningStage(lab.status, progress)} · {progress}%
          </p>
        </div>
        {isLabStatusTransitional(lab.status) ? (
          <span className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium text-primary">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            Live
          </span>
        ) : null}
      </div>

      <div className="h-1 overflow-hidden bg-secondary">
        <motion.div
          className={cn("h-full rounded-full", status === "FAILED" ? "bg-destructive" : "bg-primary")}
          initial={false}
          animate={{ width: `${progress}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 22 }}
        />
      </div>

      <div className="grid grid-cols-4 px-4 py-4">
        {lifecycleSteps.map((step, index) => {
          const state = stepState(status, index, progress);
          const Icon = step.icon;
          return (
            <motion.div
              key={step.key}
              layout
              className="relative flex flex-col items-center gap-2 px-1 text-center"
            >
              {index < lifecycleSteps.length - 1 ? (
                <span className="absolute left-1/2 top-4 h-px w-full bg-border" />
              ) : null}
              <motion.span
                initial={false}
                animate={state === "active" ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                transition={state === "active" ? { repeat: Infinity, duration: 1.4, ease: "easeInOut" } : undefined}
                className={cn(
                  "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-card",
                  state === "done" && "border-success/35 text-success",
                  state === "active" && "border-primary/45 text-primary shadow-[0_0_0_6px_color-mix(in_srgb,var(--primary)_10%,transparent)]",
                  state === "failed" && "border-destructive/35 text-destructive",
                  state === "pending" && "border-border text-muted-foreground"
                )}
              >
                {state === "done" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : state === "failed" ? (
                  <XCircle className="h-4 w-4" />
                ) : (
                  <Icon className={cn("h-4 w-4", state === "active" && "animate-spin")} />
                )}
              </motion.span>
              <p
                className={cn(
                  "relative z-10 max-w-full truncate text-[11px] font-medium",
                  state === "pending" ? "text-muted-foreground" : "text-foreground"
                )}
              >
                {step.label}
              </p>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

function InfoTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-secondary/45 p-3", accent && "border-primary/20 bg-primary/8")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 min-w-0 text-sm text-foreground">{value}</div>
    </div>
  );
}

function eventTone(event: LabEvent): string {
  const level = event.level.toLowerCase();
  if (level.includes("error")) return "border-destructive/25 bg-destructive/8";
  if (level.includes("warn")) return "border-warning/25 bg-warning/8";
  return "border-border bg-secondary/45";
}

function noticeTone(notice: ActivityNotice): string {
  if (notice.tone === "error") return "border-destructive/25 bg-destructive/8";
  if (notice.tone === "success") return "border-success/25 bg-success/8";
  return "border-border bg-secondary/45";
}

function formatClock(value: Date | null): string {
  if (!value) return "Not synced";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

function ActivityPanel({
  events,
  lab,
  isRefreshing,
  notices,
  lastSyncedAt,
}: {
  events: LabEvent[];
  lab: LabStatusResponse;
  isRefreshing: boolean;
  notices: ActivityNotice[];
  lastSyncedAt: Date | null;
}) {
  const visibleEvents = events.slice(-8).reverse();
  const status = normalizeLabStatus(lab.status);
  const latestEvent = visibleEvents[0];

  return (
    <aside className="app-card overflow-hidden lg:sticky lg:top-6 lg:self-start">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-secondary text-primary">
            <Activity className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Lab Activity</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Synced {formatClock(lastSyncedAt)}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-1 text-[11px] text-muted-foreground">
          <span className={cn("h-2 w-2 rounded-full", isRefreshing ? "bg-primary animate-pulse" : "bg-success")} />
          {isRefreshing ? "Refreshing" : "Live"}
        </span>
      </div>

      <div className="border-b border-border bg-secondary/25 px-4 py-3">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={`${status}-${lab.progress}-${latestEvent?.id ?? "none"}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Latest</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {latestEvent?.message || lab.status_message || getProvisioningStage(lab.status, lab.progress)}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="max-h-[32rem] overflow-y-auto p-3">
        {status === "FAILED" && lab.failure_reason ? (
          <div className="mb-3 rounded-lg border border-destructive/25 bg-destructive/8 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Provisioning failed
            </div>
            <p className="mt-2 text-xs leading-5 text-destructive/90">{lab.failure_reason}</p>
          </div>
        ) : null}

        {notices.length || visibleEvents.length ? (
          <div className="space-y-2">
            <AnimatePresence initial={false} mode="popLayout">
              {notices.map((notice) => (
                <motion.div
                  key={notice.id}
                  layout
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  className={cn("rounded-lg border p-3", noticeTone(notice))}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {notice.title}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{formatClock(notice.createdAt)}</span>
                  </div>
                  <p className="mt-1.5 text-sm leading-6 text-foreground">{notice.message}</p>
                </motion.div>
              ))}
              {visibleEvents.map((event) => (
                <motion.div
                  key={event.id}
                  layout
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.18 }}
                  className={cn("rounded-lg border p-3", eventTone(event))}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {event.phase}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatDateTime(event.created_at)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm leading-6 text-foreground">{event.message}</p>
                  {event.progress !== null ? (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-background/80">
                      <motion.div
                        className="h-full rounded-full bg-primary transition-all"
                        initial={false}
                        animate={{ width: `${Math.max(4, Math.min(100, event.progress))}%` }}
                      />
                    </div>
                  ) : null}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-6 text-center">
            <Terminal className="mx-auto h-5 w-5 text-muted-foreground/60" />
            <p className="mt-2 text-sm font-medium text-foreground">No activity yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Status changes and actions will appear here.</p>
          </div>
        )}
      </div>
    </aside>
  );
}

export default function LabDetailPage() {
  const params = useParams<{ id: string }>();
  const { isAuthReady, tokens } = useAuth();
  const [lab, setLab] = useState<LabStatusResponse | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [events, setEvents] = useState<LabEvent[]>([]);
  const [notices, setNotices] = useState<ActivityNotice[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const pushActivityNotice = useCallback((notice: Omit<ActivityNotice, "id" | "createdAt">) => {
    setNotices((current) => [
      {
        ...notice,
        id: crypto.randomUUID(),
        createdAt: new Date(),
      },
      ...current,
    ].slice(0, 4));
  }, []);

  const loadLab = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!isAuthReady || !tokens?.access_token) {
        return null;
      }

      if (silent) {
        setIsRefreshing(true);
      } else {
        setIsInitialLoading(true);
      }

      try {
        const [nextLab, nextEvents] = await Promise.all([
          getLabStatus(params.id),
          getLabEvents(params.id),
        ]);
        setLab(nextLab);
        setEvents(nextEvents);
        setLastSyncedAt(new Date());
        setErrorMessage(null);
        return nextLab;
      } catch (error) {
        console.error("Failed to load lab status", error);
        const message = extractApiErrorMessage(error);
        setErrorMessage(message);
        if (silent) {
          pushActivityNotice({
            title: "Refresh failed",
            message,
            tone: "error",
          });
        }
        return null;
      } finally {
        setIsInitialLoading(false);
        setIsRefreshing(false);
      }
    },
    [isAuthReady, params.id, pushActivityNotice, tokens?.access_token]
  );

  useEffect(() => {
    if (!isAuthReady || !tokens?.access_token) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadLab();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [isAuthReady, loadLab, tokens?.access_token]);

  useEffect(() => {
    if (!lab || !isAuthReady || !tokens?.access_token || isWorking) {
      return;
    }

    const normalized = normalizeLabStatus(lab.status);
    if (isLabStatusTerminal(normalized)) {
      return;
    }

    const delay = isLabStatusTransitional(normalized) ? 3000 : 15000;
    const timeoutId = window.setTimeout(() => {
      void loadLab({ silent: true });
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [isAuthReady, isWorking, lab, loadLab, tokens?.access_token]);

  const downloadConfig = async () => {
    if (!lab || normalizeLabStatus(lab.status) !== "READY") {
      pushActivityNotice({
        title: "Config not ready",
        message: "Access config is available after the lab is running.",
        tone: "info",
      });
      return;
    }

    setIsWorking(true);

    try {
      const { blob, filename } = await getLabConfigDownload(params.id);
      downloadBlob(new Blob([blob], { type: blob.type || "text/plain;charset=utf-8" }), filename);
      pushActivityNotice({
        title: "Downloaded",
        message: `${filename} saved by the browser.`,
        tone: "success",
      });
    } catch (error) {
      console.error("Failed to download access config", error);
      pushActivityNotice({
        title: "Config unavailable",
        message: extractApiErrorMessage(error),
        tone: "error",
      });
    } finally {
      setIsWorking(false);
    }
  };

  const destroyLab = async () => {
    setIsWorking(true);

    try {
      await stopLab(params.id);
      pushActivityNotice({
        title: "Destroy requested",
        message: "Teardown has been queued. This page will keep refreshing.",
        tone: "success",
      });
      await loadLab({ silent: true });
    } catch (error) {
      console.error("Failed to stop lab", error);
      pushActivityNotice({
        title: "Destroy failed",
        message: extractApiErrorMessage(error),
        tone: "error",
      });
      await loadLab({ silent: true });
    } finally {
      setIsWorking(false);
    }
  };

  const status = lab ? normalizeLabStatus(lab.status) : "QUEUED";
  const canDownloadConfig = status === "READY";
  const canStop = lab && !["FAILED", "EXPIRED", "STOPPED"].includes(status);

  const accessHint = useMemo(() => {
    if (!lab) return "Loading access details";
    if (status === "READY") return "Private access is ready through WireGuard.";
    if (status === "FAILED") return lab.failure_reason ?? "Provisioning failed before access was configured.";
    if (status === "DESTROYING") return "Teardown is in progress.";
    return "Config available after lab is running.";
  }, [lab, status]);

  if (!isAuthReady || !tokens?.access_token || (isInitialLoading && !lab)) {
    return <LabDetailSkeleton />;
  }

  if (errorMessage && !lab) {
    return (
      <div className="app-card mx-auto max-w-xl p-8 text-center">
        <h1 className="text-2xl text-foreground">Lab unavailable</h1>
        <p className="mt-3 text-sm text-muted-foreground">{errorMessage}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button type="button" variant="secondary" onClick={() => loadLab()}>
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
          <Link href="/labs" className={cn(buttonVariants.ghost, "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm")}>
            <ArrowLeft className="h-4 w-4" />
            Back to labs
          </Link>
        </div>
      </div>
    );
  }

  if (!lab) {
    return null;
  }

  return (
    <div className="space-y-6">
      <Link href="/labs" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        My Labs
      </Link>

      {errorMessage ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive">
          <span>{errorMessage}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => loadLab({ silent: true })}>
            Retry
          </Button>
        </div>
      ) : null}

      <motion.header
        layout
        className="app-card overflow-hidden"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={lab.status} />
            </div>
            <h1 className="mono mt-3 truncate text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {lab.instance_id}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Template {lab.template_id} - expires in {getTimeRemaining(lab.expires_at)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button
              type="button"
              variant="secondary"
              disabled={!canDownloadConfig || isWorking}
              onClick={downloadConfig}
              title={canDownloadConfig ? "Download WireGuard access config" : "Config available after lab is running"}
            >
              <Download className="h-4 w-4" />
              Download access config
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={!canStop || isWorking}
              onClick={() => setConfirmStop(true)}
            >
              <Square className="h-4 w-4" />
              Stop lab
            </Button>
          </div>
        </div>
        <div className="border-t border-border bg-secondary/35 px-5 py-3 text-sm text-muted-foreground">
          {accessHint}
        </div>
      </motion.header>

      <LifecyclePanel lab={lab} />

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <section className="app-card p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-secondary text-primary">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Private lab access</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Lab tasks stay private. Access is routed through WireGuard when ready.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <InfoTile
                label="Private IP"
                value={<span className="mono">{lab.ecs_private_ip ?? "Pending"}</span>}
                accent={status === "READY"}
              />
              <InfoTile
                label="Private endpoint"
                value={
                  lab.challenge_url ? (
                    <span className="mono flex min-w-0 items-center gap-1.5 truncate">
                      <span className="truncate">{lab.challenge_url}</span>
                    </span>
                  ) : (
                    "Available through private routing"
                  )
                }
              />
              <InfoTile label="Started" value={formatDateTime(lab.started_at)} />
              <InfoTile label="Expires" value={formatDateTime(lab.expires_at)} />
            </div>
          </section>

          {status === "FAILED" || status === "STOPPED" || status === "EXPIRED" ? (
            <section className="app-card p-5">
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg",
                    status === "FAILED" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                  )}
                >
                  {status === "FAILED" ? <AlertTriangle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    {status === "FAILED" ? "Provisioning failed" : status === "EXPIRED" ? "Lab expired" : "Lab stopped"}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {lab.failure_reason ?? "Start a new lab from the catalog when you are ready."}
                  </p>
                </div>
              </div>
              <Link
                href="/catalog"
                className={cn(buttonVariants.primary, "mt-5 inline-flex h-10 items-center rounded-xl px-4 text-sm")}
              >
                Back to catalog
              </Link>
            </section>
          ) : (
            <section className="app-card p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-secondary text-primary">
                  <FileText className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Connection steps</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Keep the generated access config private and destroy the lab when finished.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {[
                  "Download the access config.",
                  "Import it into WireGuard.",
                  "Connect and use the private lab endpoint.",
                ].map((step, index) => (
                  <div key={step} className="rounded-lg border border-border bg-secondary/45 p-3 text-sm text-muted-foreground">
                    <span className="mb-2 flex h-6 w-6 items-center justify-center rounded-md bg-background text-xs font-semibold text-foreground">
                      {index + 1}
                    </span>
                    {step}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <ActivityPanel
          events={events}
          lab={lab}
          isRefreshing={isRefreshing}
          notices={notices}
          lastSyncedAt={lastSyncedAt}
        />
      </section>

      <ConfirmActionDialog
        open={confirmStop}
        onOpenChange={setConfirmStop}
        title="Stop lab environment?"
        description="This will queue teardown of the lab. AWS resources will be cleaned up and the session will end."
        confirmLabel="Stop lab"
        loading={isWorking}
        onConfirm={() => {
          setConfirmStop(false);
          void destroyLab();
        }}
      />
    </div>
  );
}
