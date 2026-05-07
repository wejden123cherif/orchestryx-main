"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Coins,
  RefreshCw,
  Server,
  Shield,
  Square,
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
  getAdminEvents,
  getAdminLabs,
  getAdminOverview,
  getAdminUsers,
} from "@/lib/api";
import type {
  AdminLab,
  AdminOverview,
  AdminUser,
  CreditTransaction,
  LabEvent,
} from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

type AdminTab = "labs" | "users" | "events" | "credits";

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

export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [labs, setLabs] = useState<AdminLab[]>([]);
  const [events, setEvents] = useState<LabEvent[]>([]);
  const [credits, setCredits] = useState<CreditTransaction[]>([]);
  const [tab, setTab] = useState<AdminTab>("labs");
  const [isLoading, setIsLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadAdmin = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [nextOverview, nextUsers, nextLabs, nextEvents, nextCredits] =
        await Promise.all([
          getAdminOverview(),
          getAdminUsers(),
          getAdminLabs(),
          getAdminEvents(),
          getAdminCreditTransactions(),
        ]);
      setOverview(nextOverview);
      setUsers(nextUsers);
      setLabs(nextLabs);
      setEvents(nextEvents);
      setCredits(nextCredits);
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
            Lab lifecycle, users, credits, failures, and provisioning events.
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
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric icon={Server} label="Active labs" value={overview?.labs.active ?? 0} />
          <Metric icon={Users} label="Users" value={overview?.users.total ?? 0} />
          <Metric icon={Coins} label="Credits outstanding" value={overview?.credits.outstanding_balance.toFixed(1) ?? "0"} />
          <Metric
            icon={AlertTriangle}
            label="Failed labs"
            value={overview?.labs.failed ?? failedLabs.length}
            tone={(overview?.labs.failed ?? failedLabs.length) > 0 ? "danger" : "default"}
          />
        </section>
      )}

      <div className="flex gap-2 overflow-x-auto border-b border-border pb-2">
        {(["labs", "users", "events", "credits"] as AdminTab[]).map((item) => (
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
