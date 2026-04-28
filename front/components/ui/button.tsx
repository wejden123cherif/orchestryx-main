import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
};

export const buttonVariants = {
  primary: "bg-primary text-primary-foreground hover:bg-[#4f46e5]",
  secondary: "border border-border bg-secondary text-secondary-foreground hover:bg-accent",
  ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
  danger: "border border-destructive/45 bg-transparent text-destructive hover:bg-destructive/10",
};

const sizes = {
  sm: "h-8 gap-1.5 rounded-lg px-3 text-xs",
  md: "h-10 gap-2 rounded-lg px-4 text-sm",
  lg: "h-12 gap-2 rounded-lg px-5 text-sm",
  icon: "h-9 w-9 rounded-lg p-0",
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
        "inline-flex shrink-0 items-center justify-center font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:pointer-events-none disabled:opacity-50",
        buttonVariants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
