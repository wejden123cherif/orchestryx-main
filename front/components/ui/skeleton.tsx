import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-secondary before:absolute before:inset-0 before:-translate-x-full before:bg-gradient-to-r before:from-transparent before:via-white/7 before:to-transparent before:content-[''] before:[animation:skeleton-shimmer_1.4s_infinite]",
        className
      )}
      {...props}
    />
  );
}
