import type { NormalizedLabStatus } from "@/lib/types";
import { cn, normalizeLabStatus } from "@/lib/utils";

const statusConfig: Record<NormalizedLabStatus, { text: string; dot: string }> = {
  QUEUED:       { text: "text-sky-600 dark:text-sky-400",    dot: "bg-sky-500" },
  PROVISIONING: { text: "text-primary",                      dot: "bg-primary pulse-dot" },
  STARTING:     { text: "text-cyan-600 dark:text-cyan-400",  dot: "bg-cyan-500 pulse-dot" },
  READY:        { text: "text-success",                      dot: "bg-success" },
  DESTROYING:   { text: "text-warning",                      dot: "bg-warning pulse-dot" },
  STOPPED:      { text: "text-muted-foreground",             dot: "bg-muted-foreground" },
  EXPIRED:      { text: "text-orange-600 dark:text-orange-400", dot: "bg-orange-500" },
  FAILED:       { text: "text-destructive",                  dot: "bg-destructive" },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const normalized = normalizeLabStatus(status.toString());
  const config = statusConfig[normalized] ?? statusConfig.FAILED;
  const label = normalized.toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", config.text, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
      {label}
    </span>
  );
}
