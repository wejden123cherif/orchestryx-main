"use client";

import { GitBranch } from "lucide-react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { MachineNodeData } from "@/lib/types";
import { cn } from "@/lib/utils";

type NetworkDeviceFlowNode = Node<MachineNodeData, "networkDevice">;

export function NetworkDeviceNode({
  data,
  selected,
}: NodeProps<NetworkDeviceFlowNode>) {
  return (
    <div
      className={cn(
        "w-48 rounded-lg border bg-card/95 p-3 text-left shadow-sm transition",
        selected ? "border-primary shadow-[0_0_0_4px_color-mix(in_srgb,var(--primary)_12%,transparent)]" : "border-border"
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-background !bg-primary" />
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-background !bg-primary" />
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-secondary/50 text-primary">
          <GitBranch className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{data.label}</p>
          <p className="mono mt-1 text-xs text-muted-foreground">{data.ip}</p>
        </div>
      </div>
    </div>
  );
}
