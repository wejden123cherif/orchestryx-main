"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import { Download, Server, Square, WalletCards } from "lucide-react";
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
  getLabConfig,
  stopLab,
} from "@/lib/api";
import type { ActiveLab, LabTemplate } from "@/lib/types";
import { cn, getTimeRemaining } from "@/lib/utils";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="app-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-3 text-3xl text-foreground">{value}</p>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="app-card overflow-hidden">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="grid gap-4 border-b border-border p-4 last:border-b-0 md:grid-cols-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-9 w-36" />
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { user, isLoadingUser } = useAuth();
  const { toast } = useToast();
  const [labs, setLabs] = useState<ActiveLab[]>([]);
  const [templates, setTemplates] = useState<LabTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [activeLabs, catalog] = await Promise.all([getActiveLabs(), getCatalog()]);
      setLabs(activeLabs);
      setTemplates(catalog);
    } catch (error) {
      setErrorMessage(extractApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadDashboard);
  }, [loadDashboard]);

  const templateById = useMemo(
    () => new Map(templates.map((template) => [template.id, template])),
    [templates]
  );

  const labsThisMonth = useMemo(() => {
    const now = new Date();
    return labs.filter((lab) => {
      const started = new Date(lab.started_at);
      return (
        started.getFullYear() === now.getFullYear() &&
        started.getMonth() === now.getMonth()
      );
    }).length;
  }, [labs]);

  const downloadConfig = async (instanceId: string) => {
    setActionId(instanceId);

    try {
      const config = await getLabConfig(instanceId);
      const blob = new Blob([config], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${instanceId}.conf`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast({ title: "VPN config downloaded", tone: "success" });
    } catch (error) {
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
      await loadDashboard();
    } catch (error) {
      toast({
        title: "Destroy failed",
        description: extractApiErrorMessage(error),
        tone: "error",
      });
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Provisioning, credits, and active lab sessions.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground">
          <WalletCards className="h-4 w-4 text-primary" />
          {isLoadingUser ? <Skeleton className="h-4 w-20" /> : `${user?.credits_balance ?? 0} credits`}
        </span>
      </header>

      {errorMessage ? (
        <div className="rounded-lg border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm text-red-300">
          {errorMessage}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Active Labs" value={isLoading ? "-" : String(labs.length)} />
        <StatCard
          label="Credits Balance"
          value={isLoadingUser ? "-" : String(user?.credits_balance ?? 0)}
        />
        <StatCard label="Labs This Month" value={isLoading ? "-" : String(labsThisMonth)} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl text-foreground">Active labs</h2>
          <Link
            href="/catalog"
            className={cn(buttonVariants.primary, "inline-flex h-9 items-center rounded-lg px-3 text-sm")}
          >
            Start your first lab
          </Link>
        </div>

        {isLoading ? (
          <TableSkeleton />
        ) : labs.length ? (
          <div className="app-card overflow-hidden">
            <div className="hidden grid-cols-[1.4fr_0.8fr_0.8fr_1fr] gap-4 border-b border-border px-4 py-3 text-sm text-muted-foreground md:grid">
              <span>Name</span>
              <span>Status</span>
              <span>Time remaining</span>
              <span className="text-right">Actions</span>
            </div>
            {labs.map((lab, index) => {
              const template = templateById.get(lab.template_id);
              const name = template?.title ?? lab.template_id;

              return (
                <div
                  key={lab.instance_id}
                  className={cn(
                    "grid gap-3 px-4 py-4 text-sm md:grid-cols-[1.4fr_0.8fr_0.8fr_1fr] md:items-center",
                    index % 2 === 1 && "bg-secondary/35"
                  )}
                >
                  <Link
                    href={`/labs/${lab.instance_id}` as Route}
                    className="min-w-0 text-foreground hover:text-indigo-200"
                  >
                    <span className="block truncate">{name}</span>
                    <span className="mono block truncate text-xs text-muted-foreground">
                      {lab.instance_id}
                    </span>
                  </Link>
                  <StatusBadge status={lab.status} />
                  <span className="text-muted-foreground">{getTimeRemaining(lab.expires_at)}</span>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={actionId === lab.instance_id}
                      onClick={() => downloadConfig(lab.instance_id)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      VPN Config
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      disabled={actionId === lab.instance_id}
                      onClick={() => stop(lab.instance_id)}
                    >
                      <Square className="h-3.5 w-3.5" />
                      Stop
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Server}
            title="No active labs yet"
            description="Start a template from the catalog. Running environments, VPN configuration, and teardown actions will appear here."
            action={
              <Link
                href="/catalog"
                className={cn(buttonVariants.primary, "inline-flex h-10 items-center rounded-lg px-4 text-sm")}
              >
                Browse Catalog
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}
