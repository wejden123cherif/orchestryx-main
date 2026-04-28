import * as React from "react";
import { cn } from "@/lib/utils";

export function Alert({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & { variant?: "default" | "destructive" | "success" }) {
  const variants = {
    default: "border-border bg-secondary text-foreground",
    destructive: "border-destructive/35 bg-destructive/10 text-red-200",
    success: "border-success/35 bg-success/10 text-green-200",
  };

  return (
    <div
      role="alert"
      className={cn("rounded-xl border px-4 py-3 text-sm", variants[variant], className)}
      {...props}
    />
  );
}

export function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("font-semibold", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mt-1 leading-6 opacity-85", className)} {...props} />;
}
