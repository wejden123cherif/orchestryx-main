"use client";

import type { ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { Cloud } from "lucide-react";

type AuthShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  altQuestion: string;
  altHref: Route;
  altLabel: string;
};

export function AuthShell({
  title,
  description,
  children,
  altQuestion,
  altHref,
  altLabel,
}: AuthShellProps) {
  return (
    <section className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col justify-center px-5 py-10">
      <Link href="/" className="mx-auto mb-8 flex flex-col items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card">
          <Cloud className="h-5 w-5 text-primary" />
        </div>
        <span className="text-sm font-medium text-foreground">Orchestryx</span>
      </Link>

      <div className="app-card p-6 sm:p-7">
        <div>
          <h1 className="text-2xl text-foreground">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        </div>

        <div className="mt-6">{children}</div>

        <div className="mt-6 border-t border-border pt-5 text-sm text-muted-foreground">
          {altQuestion}{" "}
          <Link href={altHref} className="text-primary hover:text-[#818cf8]">
            {altLabel}
          </Link>
        </div>
      </div>

      <footer className="mt-8 text-center text-xs text-muted-foreground">
        Orchestryx © 2026
      </footer>
    </section>
  );
}
