import type { NormalizedLabStatus } from "@/lib/types";
import { cn, normalizeLabStatus } from "@/lib/utils";

const statusStyles: Record<NormalizedLabStatus, string> = {
  PROVISIONING: "text-indigo-200",
  RUNNING: "text-green-300",
  DESTROYING: "text-amber-300",
  DESTROYED: "text-muted-foreground",
  FAILED: "text-red-300",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const tone =
    statusStyles[normalizeLabStatus(status.toString())] ?? "text-muted-foreground";

  const label = normalizeLabStatus(status.toString())
    .toString()
    .toLowerCase()
    .replace(/^\w/, (character) => character.toUpperCase());

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/70 px-2.5 py-1 text-xs",
        tone,
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
