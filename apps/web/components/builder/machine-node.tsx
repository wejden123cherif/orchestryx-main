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
        "w-64 rounded-xl border bg-card p-4 text-left transition",
        selected ? "border-primary" : "border-border"
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-primary" />
      <Handle type="source" position={Position.Right} className="!bg-primary" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden>
              {data.icon}
            </span>
            <p className="truncate text-sm font-medium text-foreground">{data.label}</p>
          </div>
          <p className="mono mt-1 text-xs text-muted-foreground">{data.ip}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {data.software.slice(0, 2).map((item) => (
          <Badge key={`${item.name}-${item.version}`} className="max-w-full truncate">
            {item.name} {item.version}
          </Badge>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="truncate text-xs text-muted-foreground">
          {data.ports.length ? `Ports ${data.ports.join(", ")}` : "No exposed ports"}
        </span>
        {hasCves ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-destructive/35 bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
            <ShieldAlert className="h-3 w-3" />
            {data.cves.length}
          </span>
        ) : (
          <span className="rounded-full border border-success/35 bg-success/10 px-2 py-0.5 text-xs text-success">
            Clean
          </span>
        )}
      </div>
    </div>
  );
}
