"use client";

import type { ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { motion } from "framer-motion";
import { Shield, Server, Zap } from "lucide-react";
import { OrchestrYXLogo } from "@/components/ui/orchestryx-logo";

type AuthShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  altQuestion: string;
  altHref: Route;
  altLabel: string;
};

const highlights = [
  { icon: Shield, text: "Isolated lab environments on AWS" },
  { icon: Server, text: "Template-driven provisioning" },
  { icon: Zap, text: "Credit-aware cost control" },
];

export function AuthShell({
  title,
  description,
  children,
  altQuestion,
  altHref,
  altLabel,
}: AuthShellProps) {
  return (
    <div className="flex min-h-screen">
      {/* ── Left: Brand panel (hidden on mobile) ── */}
      <div className="relative hidden w-[42%] min-w-[380px] max-w-[560px] overflow-hidden bg-[#0c0a1a] lg:flex lg:flex-col">
        {/* gradient orbs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-20 -top-20 h-[400px] w-[400px] rounded-full bg-primary/20 blur-[120px]" />
          <div className="absolute bottom-0 right-0 h-[300px] w-[300px] rounded-full bg-primary/10 blur-[100px]" />
        </div>

        {/* dot grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />

        {/* content */}
        <div className="relative z-10 flex flex-1 flex-col justify-between p-10">
          <Link href="/" className="flex items-center gap-3">
            <OrchestrYXLogo className="h-9 w-9" />
            <span className="text-[15px] font-semibold tracking-tight text-white">
              Orchestryx
            </span>
          </Link>

          <div className="space-y-6">
            <h2 className="max-w-[280px] text-[22px] font-semibold leading-snug tracking-tight text-white">
              Cloud cyber range for serious teams.
            </h2>
            <div className="space-y-3">
              {highlights.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.text} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/[0.08]">
                      <Icon className="h-4 w-4 text-primary-foreground/70" />
                    </div>
                    <span className="text-[13px] text-white/60">{item.text}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-[11px] text-white/25">
            Orchestryx &copy; 2026
          </p>
        </div>
      </div>

      {/* ── Right: Form panel ── */}
      <div className="relative flex flex-1 flex-col">
        {/* mobile logo */}
        <div className="flex items-center gap-2.5 p-5 lg:hidden">
          <Link href="/" className="flex items-center gap-2.5">
            <OrchestrYXLogo className="h-8 w-8" />
            <span className="text-sm font-semibold tracking-tight text-foreground">
              Orchestryx
            </span>
          </Link>
        </div>

        {/* alt link top-right */}
        <div className="absolute right-5 top-5 hidden text-[13px] text-muted-foreground lg:block">
          {altQuestion}{" "}
          <Link href={altHref} className="font-medium text-primary hover:text-primary/80">
            {altLabel}
          </Link>
        </div>

        {/* centered form area */}
        <div className="flex flex-1 items-center justify-center px-5 py-10">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="w-full max-w-[380px]"
          >
            <div className="mb-8">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {title}
              </h1>
              <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>

            {children}

            {/* alt link (mobile + bottom) */}
            <div className="mt-8 text-center text-[13px] text-muted-foreground lg:hidden">
              {altQuestion}{" "}
              <Link href={altHref} className="font-medium text-primary hover:text-primary/80">
                {altLabel}
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
