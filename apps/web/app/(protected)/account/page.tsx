"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import {
  CalendarDays,
  Clock,
  CreditCard,
  ExternalLink,
  Key,
  LogOut,
  Mail,
  Monitor,
  Moon,
  Palette,
  Server,
  Shield,
  Sun,
  UserRound,
} from "lucide-react";
import { StatusBadge } from "@/components/platform/status-badge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useTheme, type AccentColor, type ThemeMode } from "@/context/ThemeContext";
import { extractApiErrorMessage, getActiveLabs } from "@/lib/api";
import type { ActiveLab } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

const modes: { value: ThemeMode; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
];

const accents: { value: AccentColor; label: string; swatch: string }[] = [
  { value: "purple", label: "Purple", swatch: "bg-[#8b5cf6]" },
  { value: "blue", label: "Blue", swatch: "bg-[#3b82f6]" },
  { value: "green", label: "Green", swatch: "bg-[#10b981]" },
];

function SectionCard({ title, description, icon: Icon, children }: {
  title: string;
  description?: string;
  icon: typeof UserRound;
  children: React.ReactNode;
}) {
  return (
    <section className="app-card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description && (
            <p className="text-[12px] text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function InfoRow({ label, children, loading }: {
  label: string;
  children: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      {loading ? (
        <Skeleton className="h-4 w-32" />
      ) : (
        <span className="text-[13px] font-medium text-foreground">{children}</span>
      )}
    </div>
  );
}

export default function AccountPage() {
  const { user, isLoadingUser, logout } = useAuth();
  const { mode, accent, setMode, setAccent } = useTheme();
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

  const activeLabs = labs.filter((l) =>
    ["READY", "PROVISIONING", "STARTING", "QUEUED", "ready", "provisioning", "starting", "queued"].includes(l.status)
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Account</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Manage your profile, credits, and preferences.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        {/* ── Left column ── */}
        <div className="space-y-6">
          {/* Profile */}
          <SectionCard title="Profile" description="Your account information" icon={UserRound}>
            <div className="divide-y divide-border">
              <InfoRow label="Email" loading={isLoadingUser}>
                <span className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground/50" />
                  {user?.email ?? "Unavailable"}
                </span>
              </InfoRow>
              <InfoRow label="Role" loading={isLoadingUser}>
                <Badge tone={user?.role === "admin" ? "amber" : "neutral"}>
                  {user?.role ?? "user"}
                </Badge>
              </InfoRow>
              <InfoRow label="Plan" loading={isLoadingUser}>
                {user?.subscription_tier ?? "Standard"}
              </InfoRow>
              <InfoRow label="Member since" loading={isLoadingUser}>
                <span className="flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground/50" />
                  {user?.created_at ? formatDateTime(user.created_at) : "Unavailable"}
                </span>
              </InfoRow>
              <InfoRow label="Max active labs" loading={isLoadingUser}>
                {user?.max_active_labs ?? "Unlimited"}
              </InfoRow>
            </div>
          </SectionCard>

          {/* Usage history */}
          <SectionCard title="Active sessions" description="Your currently running lab environments" icon={Server}>
            {errorMessage ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">
                {errorMessage}
              </div>
            ) : isLoadingUsage ? (
              <div className="space-y-3">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-5 w-5/6" />
              </div>
            ) : usageRows.length ? (
              <div className="-mx-5 -mb-5 divide-y divide-border">
                {usageRows.map((row) => (
                  <div key={row.id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <Link href={`/labs/${row.id}` as Route} className="text-[13px] font-medium text-foreground hover:text-primary">
                        {row.label}
                      </Link>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDateTime(row.date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {row.challengeUrl && (
                        <a
                          href={row.challengeUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-[12px] text-primary hover:text-primary/80"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open
                        </a>
                      )}
                      <StatusBadge status={row.status} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                No active lab sessions.{" "}
                <Link href="/catalog" className="text-primary hover:text-primary/80">
                  Browse the catalog
                </Link>{" "}
                to launch one.
              </p>
            )}
          </SectionCard>
        </div>

        {/* ── Right column ── */}
        <div className="space-y-6">
          {/* Credits */}
          <SectionCard title="Credits" description="Your usage balance" icon={CreditCard}>
            <div className="rounded-lg border border-border bg-secondary/30 p-4">
              <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                Available
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-foreground">
                {isLoadingUser ? (
                  <Skeleton className="mt-1 h-8 w-24" />
                ) : (
                  <>{user?.credits_balance ?? 0}<span className="ml-1 text-sm font-normal text-muted-foreground">credits</span></>
                )}
              </p>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-4 py-3">
              <div>
                <p className="text-[12px] font-medium text-muted-foreground">Active labs</p>
                <p className="text-lg font-semibold tabular-nums text-foreground">{activeLabs.length}</p>
              </div>
              <div>
                <p className="text-[12px] font-medium text-muted-foreground">Total sessions</p>
                <p className="text-lg font-semibold tabular-nums text-foreground">{labs.length}</p>
              </div>
            </div>

            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
              Credits are deducted when a lab is queued. Failed provisioning refunds credits automatically.
            </p>
            <a
              href="mailto:admin@orchestryx.local?subject=Request%20Orchestryx%20credits"
              className="mt-3 inline-flex h-8 w-full items-center justify-center rounded-lg border border-border bg-secondary text-[13px] font-medium text-foreground hover:bg-accent"
            >
              Request credits
            </a>
          </SectionCard>

          {/* Appearance */}
          <SectionCard title="Appearance" description="Theme and accent color" icon={Palette}>
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-[12px] font-medium text-muted-foreground">Mode</p>
                <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/60 p-1">
                  {modes.map((m) => {
                    const Icon = m.icon;
                    const active = mode === m.value;
                    return (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setMode(m.value)}
                        className={cn(
                          "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] font-medium transition",
                          active
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[12px] font-medium text-muted-foreground">Accent color</p>
                <div className="flex items-center gap-2">
                  {accents.map((a) => (
                    <button
                      key={a.value}
                      type="button"
                      onClick={() => setAccent(a.value)}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-1.5 rounded-md border py-2 text-[12px] font-medium transition",
                        accent === a.value
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span className={cn("h-3 w-3 rounded-full", a.swatch)} />
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Security */}
          <SectionCard title="Security" description="Session and access" icon={Shield}>
            <div className="divide-y divide-border">
              <div className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2.5">
                  <Key className="h-3.5 w-3.5 text-muted-foreground/50" />
                  <span className="text-[13px] text-muted-foreground">Password</span>
                </div>
                <span className="text-[12px] text-muted-foreground/60">Managed by Cognito</span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2.5">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground/50" />
                  <span className="text-[13px] text-muted-foreground">MFA</span>
                </div>
                <Badge>Off</Badge>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                logout();
                window.location.href = "/login";
              }}
              className="mt-4 flex h-8 w-full items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 text-[13px] font-medium text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
