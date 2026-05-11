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
    neutral: "border-border bg-secondary/60 text-muted-foreground",
    blue: "border-primary/25 bg-primary/10 text-primary",
    green: "border-success/25 bg-success/10 text-success",
    amber: "border-warning/25 bg-warning/10 text-warning",
    red: "border-destructive/25 bg-destructive/10 text-destructive",
  };

  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center rounded-md border px-2 text-[11px] font-medium",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
