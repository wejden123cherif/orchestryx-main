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
        "w-56 rounded-xl border bg-[#16161f] p-4 text-left transition",
        selected ? "border-primary" : "border-border"
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-primary" />
      <Handle type="source" position={Position.Right} className="!bg-primary" />
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-primary">
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
