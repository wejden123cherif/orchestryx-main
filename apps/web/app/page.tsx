"use client";

import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Database,
  Server,
  Shield,
  Zap,
} from "lucide-react";
import { OrchestrYXLogo } from "@/components/ui/orchestryx-logo";
import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const capabilities = [
  {
    icon: Boxes,
    title: "Template-driven labs",
    text: "Repeatable AWS environments for web, network, Active Directory, DFIR, and malware analysis training.",
  },
  {
    icon: Shield,
    title: "Isolated by design",
    text: "Users work through generated access material. AWS accounts and provisioning stay behind the platform.",
  },
  {
    icon: Database,
    title: "Credit-aware operations",
    text: "Every launch surfaces cost, TTL, and status so instructors control spend without manual AWS work.",
  },
];

const services = [
  { label: "API", detail: "FastAPI service", status: "Online" },
  { label: "Queue", detail: "SQS provisioning", status: "Ready" },
  { label: "Worker", detail: "Celery runner", status: "Idle" },
  { label: "Database", detail: "Aurora Postgres", status: "Connected" },
];

export default function HomePage() {
  const { isAuthenticated } = useAuth();

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <OrchestrYXLogo className="h-8 w-8" />
            <span className="text-sm font-semibold tracking-tight text-foreground">Orchestryx</span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className={cn(buttonVariants.ghost, "inline-flex h-9 items-center rounded-lg px-3.5 text-sm")}
            >
              Sign in
            </Link>
            <Link
              href={isAuthenticated ? "/dashboard" : "/register"}
              className={cn(buttonVariants.primary, "inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm")}
            >
              {isAuthenticated ? "Open console" : "Get started"}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.04] blur-[100px]" />
        </div>

        <div className="mx-auto grid max-w-6xl gap-16 px-5 pb-20 pt-24 lg:grid-cols-[1fr_22rem] lg:gap-12 lg:pt-32">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1">
              <Zap className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium text-primary">Cloud cyber range for serious teams</span>
            </div>
            <h1 className="text-balance max-w-3xl text-4xl leading-[1.15] tracking-tight text-foreground sm:text-5xl lg:text-[3.25rem]">
              Spin up isolated AWS lab environments like product infrastructure.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
              Orchestryx is the control plane for security teams, universities, and trainers to provision repeatable hacking labs without handing users direct AWS access.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={isAuthenticated ? "/dashboard" : "/register"}
                className={cn(buttonVariants.primary, "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm")}
              >
                Start from the catalog
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className={cn(buttonVariants.secondary, "inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm")}
              >
                Sign in to console
              </Link>
            </div>
          </div>

          <div className="app-card overflow-hidden p-px">
            <div className="rounded-[11px] bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Control plane</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Production status</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/5 px-2 py-0.5 text-[11px] font-medium text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success pulse-dot" />
                  Healthy
                </span>
              </div>

              <div className="mt-4 space-y-1.5">
                {services.map(({ label, detail, status }) => (
                  <div key={label} className="flex items-center gap-3 rounded-lg bg-secondary/50 px-3 py-2">
                    <span className="w-14 text-xs font-medium text-muted-foreground">{label}</span>
                    <span className="flex-1 truncate text-xs text-foreground">{detail}</span>
                    <span className="text-[11px] text-muted-foreground">{status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-card/50">
        <div className="mx-auto grid max-w-6xl gap-px overflow-hidden px-5 py-16 sm:grid-cols-3 sm:px-0">
          {capabilities.map((item, i) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className={cn("px-6 py-1", i > 0 && "sm:border-l sm:border-border")}>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/8 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-border px-5 py-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between text-xs text-muted-foreground">
          <span>Orchestryx &copy; 2026</span>
          <span className="hidden items-center gap-1.5 sm:flex">
            <Server className="h-3 w-3" />
            AWS-backed lab infrastructure
          </span>
        </div>
      </footer>
    </main>
  );
}
