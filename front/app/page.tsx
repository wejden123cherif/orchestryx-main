"use client";

import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Cloud,
  Database,
  Network,
  Server,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const capabilities = [
  {
    icon: Boxes,
    title: "Template-driven labs",
    text: "Give teams repeatable AWS environments for web, network, Active Directory, DFIR, and malware analysis training.",
  },
  {
    icon: Network,
    title: "Isolated access",
    text: "Users work through generated access material while AWS accounts, queues, and provisioning logic stay behind the platform.",
  },
  {
    icon: Database,
    title: "Credit-aware operations",
    text: "Every launch exposes cost, TTL, and status so instructors and operators can control spend without manual AWS work.",
  },
];

export default function HomePage() {
  const { isAuthenticated } = useAuth();

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card">
              <Cloud className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-medium text-foreground">Orchestryx</span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className={cn(buttonVariants.ghost, "inline-flex h-10 items-center rounded-lg px-4 text-sm")}
            >
              Sign in
            </Link>
            <Link
              href={isAuthenticated ? "/dashboard" : "/register"}
              className={cn(buttonVariants.primary, "inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm")}
            >
              {isAuthenticated ? "Open console" : "Create account"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-5 py-20 lg:grid-cols-[minmax(0,1fr)_26rem] lg:py-28">
        <div>
          <p className="mb-5 text-sm text-muted-foreground">
            Cloud cyber range infrastructure for serious teams
          </p>
          <h1 className="max-w-4xl text-5xl leading-tight text-foreground sm:text-6xl">
            Spin up isolated AWS lab environments like product infrastructure.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground">
            Orchestryx is a B2B control plane for security teams, universities, and trainers to provision repeatable hacking labs without handing users direct AWS access.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={isAuthenticated ? "/dashboard" : "/register"}
              className={cn(buttonVariants.primary, "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm")}
            >
              Start from the catalog
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className={cn(buttonVariants.secondary, "inline-flex h-11 items-center justify-center rounded-lg px-5 text-sm")}
            >
              Sign in to console
            </Link>
          </div>
        </div>

        <div className="app-card p-4">
          <div className="rounded-lg border border-border bg-[#0d0d13] p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg text-foreground">Production range</h2>
                <p className="text-sm text-muted-foreground">Control plane overview</p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-success/35 px-2.5 py-1 text-xs text-green-300">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Healthy
              </span>
            </div>

            <div className="mt-6 grid gap-2">
              {[
                ["API", "FastAPI service", "Online"],
                ["Queue", "SQS provisioning", "Ready"],
                ["Worker", "Celery task runner", "Idle"],
                ["Database", "Aurora PostgreSQL", "Connected"],
              ].map(([label, detail, status]) => (
                <div key={label} className="grid grid-cols-[5rem_1fr_auto] items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="truncate text-foreground">{detail}</span>
                  <span className="text-muted-foreground">{status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-5 pb-20 md:grid-cols-3">
        {capabilities.map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.title} className="app-card p-5">
              <Icon className="h-5 w-5 text-primary" />
              <h3 className="mt-5 text-lg text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.text}</p>
            </article>
          );
        })}
      </section>

      <footer className="border-t border-border px-5 py-7">
        <div className="mx-auto flex max-w-6xl items-center justify-between text-xs text-muted-foreground">
          <span>Orchestryx © 2026</span>
          <span className="hidden items-center gap-2 sm:flex">
            <Server className="h-3.5 w-3.5" />
            AWS-backed lab infrastructure
          </span>
        </div>
      </footer>
    </main>
  );
}
