import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.ComponentProps<"span"> & {
  tone?: "neutral" | "blue" | "green" | "amber" | "red";
}) {
  const tones = {
    neutral: "border-border bg-muted text-muted-foreground",
    blue: "border-primary/35 bg-primary/10 text-indigo-200",
    green: "border-success/35 bg-success/10 text-green-300",
    amber: "border-warning/35 bg-warning/10 text-amber-300",
    red: "border-destructive/35 bg-destructive/10 text-red-300",
  };

  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-normal",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
