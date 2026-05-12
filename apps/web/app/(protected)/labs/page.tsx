"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw, Server, ShieldCheck, Square } from "lucide-react";
import { motion } from "framer-motion";
import { ConfirmActionDialog } from "@/components/platform/confirm-dialog";
import { EmptyState } from "@/components/platform/empty-state";
import { StatusBadge } from "@/components/platform/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  extractApiErrorMessage,
  getActiveLabs,
  getLabConfigDownload,
  stopLab,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type { ActiveLab } from "@/lib/types";
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

function LabsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="app-card p-4">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="mt-3 h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export default function LabsPage() {
  const { toast } = useToast();
  const { isAuthReady, tokens } = useAuth();
  const [labs, setLabs] = useState<ActiveLab[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmStopId, setConfirmStopId] = useState<string | null>(null);

  const loadLabs = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!isAuthReady || !tokens?.access_token) {
      return;
    }

    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsInitialLoading(true);
    }
    setErrorMessage(null);

    try {
      setLabs(await getActiveLabs());
    } catch (error) {
      console.error("Failed to load active labs", error);
      setErrorMessage(extractApiErrorMessage(error));
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  }, [isAuthReady, tokens?.access_token]);

  useEffect(() => {
    if (!isAuthReady || !tokens?.access_token) {
      return;
    }

    void Promise.resolve().then(() => loadLabs());
  }, [isAuthReady, loadLabs, tokens?.access_token]);

  useEffect(() => {
    if (!isAuthReady || !tokens?.access_token || !labs.length) {
      return;
    }

    const hasTransitionalLab = labs.some((lab) => isLabStatusTransitional(lab.status));
    const hasLiveLab = labs.some((lab) => !isLabStatusTerminal(lab.status));
    if (!hasLiveLab) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadLabs({ silent: true });
    }, hasTransitionalLab ? 4000 : 15000);

    return () => window.clearTimeout(timeoutId);
  }, [isAuthReady, labs, loadLabs, tokens?.access_token]);

  const downloadConfig = async (instanceId: string) => {
    setActionId(instanceId);

    try {
      const { blob, filename } = await getLabConfigDownload(instanceId);
      downloadBlob(new Blob([blob], { type: blob.type || "text/plain;charset=utf-8" }), filename);
      toast({ title: "Access config downloaded", tone: "success" });
    } catch (error) {
      console.error("Failed to download active lab config", error);
      toast({
        title: "Config unavailable",
        description: extractApiErrorMessage(error),
        tone: "error",
      });
    } finally {
      setActionId(null);
    }
  };

  const stop = async (instanceId: string) => {
    setActionId(instanceId);

    try {
      await stopLab(instanceId);
      toast({ title: "Destroy requested", tone: "success" });
      await loadLabs({ silent: true });
    } catch (error) {
      console.error("Failed to stop active lab", error);
      toast({
        title: "Destroy failed",
        description: extractApiErrorMessage(error),
        tone: "error",
      });
      await loadLabs({ silent: true });
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">My Labs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Active environments, access config, and lifecycle controls.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => loadLabs({ silent: true })} disabled={isRefreshing}>
          <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
          Refresh
        </Button>
      </header>

      {errorMessage ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      {!isAuthReady || !tokens?.access_token || (isInitialLoading && !labs.length) ? (
        <LabsSkeleton />
      ) : labs.length ? (
        <section className="app-card overflow-hidden">
          {labs.map((lab, index) => (
            <motion.div
              key={lab.instance_id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "grid gap-4 border-b border-border p-4 last:border-b-0 lg:grid-cols-[1.4fr_0.7fr_0.7fr_0.9fr_auto] lg:items-center",
                index % 2 === 1 && "bg-secondary/35"
              )}
            >
              <Link href={`/labs/${lab.instance_id}` as Route} className="min-w-0">
                <p className="mono truncate text-sm text-foreground">{lab.instance_id}</p>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  Template {lab.template_id}
                </p>
              </Link>
              <StatusBadge status={lab.status} />
              <div>
                <span className="text-sm text-muted-foreground">{getTimeRemaining(lab.expires_at)}</span>
                {normalizeLabStatus(lab.status) !== "READY" ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {getProvisioningStage(lab.status, lab.progress)} - {lab.progress}%
                  </p>
                ) : null}
              </div>
              <span className="text-sm text-muted-foreground">{formatDateTime(lab.started_at)}</span>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <span className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-success/20 bg-success/8 px-3 text-xs font-medium text-success">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Private
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={actionId === lab.instance_id || normalizeLabStatus(lab.status) !== "READY"}
                  title={normalizeLabStatus(lab.status) === "READY" ? "Download WireGuard access config" : "Config available after lab is running"}
                  onClick={() => downloadConfig(lab.instance_id)}
                >
                  <Download className="h-3.5 w-3.5" />
                  VPN Config
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  disabled={
                    actionId === lab.instance_id ||
                    ["FAILED", "EXPIRED", "STOPPED"].includes(normalizeLabStatus(lab.status))
                  }
                  onClick={() => setConfirmStopId(lab.instance_id)}
                >
                  <Square className="h-3.5 w-3.5" />
                  Stop
                </Button>
              </div>
            </motion.div>
          ))}
        </section>
      ) : (
        <EmptyState
          icon={Server}
          title="No active lab environments"
          description="Start a template from the catalog. This view will show status, time remaining, VPN config, and stop actions."
          action={
            <Link
              href="/catalog"
              className={cn(buttonVariants.primary, "inline-flex h-10 items-center rounded-lg px-4 text-sm")}
            >
              Browse catalog
            </Link>
          }
        />
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
