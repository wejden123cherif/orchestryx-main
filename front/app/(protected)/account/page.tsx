"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CreditCard, Mail, UserRound } from "lucide-react";
import { StatusBadge } from "@/components/platform/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { extractApiErrorMessage, getActiveLabs } from "@/lib/api";
import type { ActiveLab } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export default function AccountPage() {
  const { user, isLoadingUser } = useAuth();
  const [labs, setLabs] = useState<ActiveLab[]>([]);
  const [isLoadingUsage, setIsLoadingUsage] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadUsage = useCallback(async () => {
    setIsLoadingUsage(true);
    setErrorMessage(null);

    try {
      setLabs(await getActiveLabs());
    } catch (error) {
      setErrorMessage(extractApiErrorMessage(error));
    } finally {
      setIsLoadingUsage(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadUsage);
  }, [loadUsage]);

  const usageRows = useMemo(
    () =>
      labs.map((lab) => ({
        id: lab.instance_id,
        date: lab.started_at,
        label: `Lab ${lab.template_id}`,
        status: lab.status,
      })),
    [labs]
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl text-foreground">Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Profile details and credit usage visible through the current backend contracts.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="app-card p-6">
          <h2 className="text-xl text-foreground">Profile</h2>
          <div className="mt-5 grid gap-3">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/50 p-3">
              <Mail className="h-4 w-4 text-primary" />
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="truncate text-sm text-foreground">
                  {isLoadingUser ? "Loading..." : (user?.email ?? "Unavailable")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/50 p-3">
              <CalendarDays className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Member since</p>
                <p className="text-sm text-foreground">
                  {isLoadingUser || !user?.created_at ? "Unavailable" : formatDateTime(user.created_at)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/50 p-3">
              <UserRound className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Plan</p>
                <p className="text-sm text-foreground">
                  {isLoadingUser ? "Loading..." : (user?.subscription_tier ?? "Standard")}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="app-card p-6">
          <h2 className="text-xl text-foreground">Credits</h2>
          <div className="mt-5 rounded-lg border border-border bg-secondary/50 p-5">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-primary" />
              <p className="text-sm text-muted-foreground">Available balance</p>
            </div>
            <p className="mt-4 text-4xl text-foreground">
              {isLoadingUser ? "-" : (user?.credits_balance ?? 0)}
            </p>
          </div>
        </div>
      </section>

      <section className="app-card overflow-hidden">
        <div className="border-b border-border p-5">
          <h2 className="text-xl text-foreground">Usage history</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The current API exposes active lab sessions. Historical billing can be added here when the backend publishes it.
          </p>
        </div>

        {errorMessage ? (
          <div className="border-b border-border px-5 py-3 text-sm text-red-300">
            {errorMessage}
          </div>
        ) : null}

        {isLoadingUsage ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-5/6" />
          </div>
        ) : usageRows.length ? (
          <div className="divide-y divide-border">
            {usageRows.map((row) => (
              <div key={row.id} className="grid gap-3 px-5 py-4 text-sm md:grid-cols-[1fr_1fr_auto] md:items-center">
                <span className="text-foreground">{row.label}</span>
                <span className="text-muted-foreground">{formatDateTime(row.date)}</span>
                <StatusBadge status={row.status} />
              </div>
            ))}
          </div>
        ) : (
          <div className="p-5 text-sm text-muted-foreground">
            No active usage records are available yet.
          </div>
        )}
      </section>
    </div>
  );
}
