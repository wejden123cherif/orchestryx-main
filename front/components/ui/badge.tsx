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
    blue: "border-primary/20 bg-primary/6 text-primary",
    green: "border-success/20 bg-success/6 text-success",
    amber: "border-warning/20 bg-warning/6 text-warning",
    red: "border-destructive/20 bg-destructive/6 text-destructive",
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
