import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
};

export const buttonVariants = {
  primary: "bg-primary text-primary-foreground shadow-sm shadow-primary/15 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/20 active:bg-primary/85",
  secondary: "border border-border bg-card text-secondary-foreground shadow-sm hover:border-primary/25 hover:bg-secondary active:bg-secondary/80",
  ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
  danger: "border border-destructive/25 bg-destructive/5 text-destructive shadow-sm hover:bg-destructive/10 active:bg-destructive/15",
};

const sizes = {
  sm: "h-9 gap-1.5 rounded-lg px-3 text-xs",
  md: "h-10 gap-2 rounded-lg px-4 text-sm",
  lg: "h-11 gap-2 rounded-lg px-5 text-sm",
  icon: "h-10 w-10 rounded-lg p-0",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-medium outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1 focus-visible:ring-offset-background enabled:active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        buttonVariants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
