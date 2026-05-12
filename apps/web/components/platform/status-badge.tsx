import {
  CheckCircle2,
  Clock3,
  Loader2,
  Radio,
  Square,
  TriangleAlert,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { NormalizedLabStatus } from "@/lib/types";
import { cn, normalizeLabStatus } from "@/lib/utils";

const statusConfig: Record<NormalizedLabStatus, { text: string; icon: LucideIcon; spin?: boolean }> = {
  QUEUED:       { text: "text-sky-600 dark:text-sky-400", icon: Clock3 },
  PROVISIONING: { text: "text-primary", icon: Loader2, spin: true },
  STARTING:     { text: "text-cyan-600 dark:text-cyan-400", icon: Radio },
  READY:        { text: "text-success", icon: CheckCircle2 },
  DESTROYING:   { text: "text-warning", icon: Loader2, spin: true },
  STOPPED:      { text: "text-muted-foreground", icon: Square },
  EXPIRED:      { text: "text-orange-600 dark:text-orange-400", icon: TriangleAlert },
  FAILED:       { text: "text-destructive", icon: XCircle },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const normalized = normalizeLabStatus(status.toString());
  const config = statusConfig[normalized] ?? statusConfig.FAILED;
  const Icon = config.icon;
  const label = normalized.toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

  return (
    <span
      aria-label={`Lab status: ${label}`}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border border-current/15 bg-current/[0.07] px-2.5 text-xs font-medium",
        config.text,
        className
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", config.spin && "animate-spin")} />
      {label}
    </span>
  );
}
