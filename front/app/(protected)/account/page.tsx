"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import { CalendarDays, CreditCard, ExternalLink, Mail, UserRound } from "lucide-react";
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
        challengeUrl: lab.challenge_url,
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
                {isLoadingUser ? (
                  <Skeleton className="mt-1 h-4 w-48" />
                ) : (
                  <p className="truncate text-sm text-foreground">{user?.email ?? "Unavailable"}</p>
                )}
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
                {isLoadingUser ? (
                  <Skeleton className="mt-1 h-4 w-24" />
                ) : (
                  <p className="text-sm text-foreground">{user?.subscription_tier ?? "Standard"}</p>
                )}
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
              <div key={row.id} className="grid gap-3 px-5 py-4 text-sm md:grid-cols-[1fr_1fr_auto_auto] md:items-center">
                <Link href={`/labs/${row.id}` as Route} className="text-foreground hover:text-indigo-200">
                  {row.label}
                </Link>
                <span className="text-muted-foreground">{formatDateTime(row.date)}</span>
                {row.challengeUrl ? (
                  <a
                    href={row.challengeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-primary hover:text-[#818cf8]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open
                  </a>
                ) : null}
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
