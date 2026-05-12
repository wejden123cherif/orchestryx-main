"use client";

import { ShieldAlert } from "lucide-react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import type { MachineNodeData } from "@/lib/types";
import { cn } from "@/lib/utils";

type MachineFlowNode = Node<MachineNodeData, "machine">;

export function MachineNode({ data, selected }: NodeProps<MachineFlowNode>) {
  const hasCves = data.cves.length > 0;

  return (
    <div
      className={cn(
        "w-52 rounded-lg border bg-card/95 p-3 text-left shadow-sm transition",
        selected ? "border-primary shadow-[0_0_0_4px_color-mix(in_srgb,var(--primary)_12%,transparent)]" : "border-border"
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-background !bg-primary" />
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-background !bg-primary" />
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary/50 text-base" aria-hidden>
          {data.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">{data.label}</p>
          </div>
          <p className="mono mt-1 text-xs text-muted-foreground">{data.ip}</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {data.software.slice(0, 2).map((item) => (
          <Badge key={`${item.name}-${item.version}`} className="h-5 max-w-full truncate px-1.5 text-[10px]">
            {item.name} {item.version}
          </Badge>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">
          {data.ports.length ? `Ports ${data.ports.join(", ")}` : "No exposed ports"}
        </span>
        {hasCves ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-destructive/35 bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
            <ShieldAlert className="h-3 w-3" />
            {data.cves.length}
          </span>
        ) : (
          <span className="rounded-full border border-success/35 bg-success/10 px-1.5 py-0.5 text-[10px] text-success">
            Clean
          </span>
        )}
      </div>
    </div>
  );
}
