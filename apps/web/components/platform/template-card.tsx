import { ArrowRight, Clock3, Cpu, Database, Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/platform/status-badge";
import type { ActiveLab, LabTemplate } from "@/lib/types";
import { cn, getDifficultyTone, isLabStatusTerminal, isLabStatusTransitional, normalizeLabStatus } from "@/lib/utils";

export function TemplateCard({
  template,
  onStart,
  isStarting,
  activeLab,
}: {
  template: LabTemplate;
  onStart: (templateId: string) => void;
  isStarting?: boolean;
  activeLab?: ActiveLab;
}) {
  const activeStatus = activeLab ? normalizeLabStatus(activeLab.status) : null;
  const hasLiveInstance = Boolean(activeLab && !isLabStatusTerminal(activeLab.status));
  const isProvisioning = Boolean(activeLab && isLabStatusTransitional(activeLab.status));

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="app-card-interactive signal-sweep flex h-full flex-col p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <Badge>{template.category}</Badge>
        <div className="flex flex-wrap justify-end gap-1.5">
          {activeLab && hasLiveInstance ? <StatusBadge status={activeLab.status} /> : null}
          <Badge tone={getDifficultyTone(template.difficulty)}>{template.difficulty}</Badge>
        </div>
      </div>

      <Link href={`/catalog/${template.id}` as Route}>
        <h3 className="mt-4 text-[15px] font-semibold text-foreground transition-colors hover:text-primary">
          {template.title}
        </h3>
      </Link>

      <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-muted-foreground line-clamp-3">
        {template.description}
      </p>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Database className="h-3 w-3 text-primary/50" />
          {template.credits_cost} credits
        </span>
        <span className="flex items-center gap-1.5">
          <Clock3 className="h-3 w-3 text-primary/50" />
          {template.ttl_hours}h TTL
        </span>
        <span className="flex items-center gap-1.5">
          <Cpu className="h-3 w-3 text-primary/50" />
          {template.instance_type}
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-secondary/35 p-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          Isolated private launch
        </div>
        <p className="mt-1 leading-5">Access details are generated after provisioning and delivered as a WireGuard config.</p>
      </div>

      {activeLab && hasLiveInstance ? (
        <Link
          href={`/labs/${activeLab.instance_id}` as Route}
          className={cn(
            activeStatus === "READY" ? buttonVariants.primary : buttonVariants.secondary,
            "mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium"
          )}
        >
          {isProvisioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
          {activeStatus === "READY" ? "View session" : "View progress"}
        </Link>
      ) : (
        <Button
          type="button"
          className="mt-4 w-full gap-2"
          disabled={isStarting}
          onClick={() => onStart(template.id)}
        >
          {isStarting ? "Starting..." : "Launch"}
          {!isStarting && <ArrowRight className="h-3.5 w-3.5" />}
        </Button>
      )}
    </motion.article>
  );
}
