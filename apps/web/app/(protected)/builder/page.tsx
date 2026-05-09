"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeTypes,
} from "@xyflow/react";
import { motion } from "framer-motion";
import {
  Download,
  Eraser,
  Flag,
  Rocket,
  Save,
  ShieldAlert,
  X,
} from "lucide-react";
import { DragEvent, useCallback, useMemo, useState } from "react";
import { MachineNode } from "@/components/builder/machine-node";
import { NetworkDeviceNode } from "@/components/builder/network-device-node";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { extractApiErrorMessage, startCustomLab } from "@/lib/api";
import type {
  BuilderCategory,
  BuilderEdgeData,
  BuilderMachineTemplate,
  ConnectionAction,
  ConnectionDirection,
  ConnectionProtocol,
  ConnectionRule,
  CustomLabTopology,
  MachineNodeData,
  SoftwareConfig,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const CVE_MAP: Record<string, string[]> = {
  "nginx-1.14.0": ["CVE-2021-23017"],
  "nginx-1.16.0": ["CVE-2021-23017"],
  "apache-2.4.49": ["CVE-2021-41773", "CVE-2021-42013"],
  "windows-server-2008": ["MS17-010", "CVE-2017-0144"],
  "php-7.2": ["CVE-2019-11043"],
  "mysql-5.6": ["CVE-2016-6662"],
  "log4j-2.14": ["CVE-2021-44228"],
};

const SOFTWARE_VERSIONS: Record<string, string[]> = {
  nginx: ["1.14.0", "1.16.0", "1.24.0"],
  apache: ["2.4.49", "2.4.58"],
  php: ["7.2", "8.3"],
  mysql: ["5.6", "8.0"],
  log4j: ["2.14", "2.22"],
  windows: ["server-2008", "server-2016", "server-2019"],
};

const MACHINE_TEMPLATES: BuilderMachineTemplate[] = [
  {
    id: "kali",
    category: "Attacker Machines",
    label: "Kali Linux",
    os: "Kali Linux",
    version: "2024.4",
    kind: "machine",
    icon: "K",
    ports: [22],
    software: [{ name: "metasploit", version: "6.4", cves: [] }],
  },
  {
    id: "parrot",
    category: "Attacker Machines",
    label: "Parrot OS",
    os: "Parrot OS",
    version: "6.1",
    kind: "machine",
    icon: "P",
    ports: [22],
    software: [{ name: "nmap", version: "7.95", cves: [] }],
  },
  {
    id: "ubuntu",
    category: "Target Machines",
    label: "Ubuntu Server",
    os: "Ubuntu",
    version: "22.04",
    kind: "machine",
    icon: "U",
    ports: [22, 80],
    software: [{ name: "nginx", version: "1.24.0", cves: [] }],
  },
  {
    id: "windows-2019",
    category: "Target Machines",
    label: "Windows Server 2019",
    os: "Windows Server",
    version: "2019",
    kind: "machine",
    icon: "W",
    ports: [3389, 445],
    software: [{ name: "windows", version: "server-2019", cves: [] }],
  },
  {
    id: "windows-2016",
    category: "Target Machines",
    label: "Windows Server 2016",
    os: "Windows Server",
    version: "2016",
    kind: "machine",
    icon: "W",
    ports: [3389, 445],
    software: [{ name: "windows", version: "server-2016", cves: [] }],
  },
  {
    id: "centos",
    category: "Target Machines",
    label: "CentOS 7",
    os: "CentOS",
    version: "7",
    kind: "machine",
    icon: "C",
    ports: [22, 80],
    software: [{ name: "apache", version: "2.4.58", cves: [] }],
  },
  {
    id: "debian",
    category: "Target Machines",
    label: "Debian 11",
    os: "Debian",
    version: "11",
    kind: "machine",
    icon: "D",
    ports: [22],
    software: [{ name: "mysql", version: "8.0", cves: [] }],
  },
  {
    id: "router",
    category: "Network Devices",
    label: "Router",
    os: "Network Appliance",
    version: "managed",
    kind: "network-device",
    icon: "R",
    ports: [],
    software: [],
  },
  {
    id: "firewall",
    category: "Network Devices",
    label: "Firewall",
    os: "Network Appliance",
    version: "managed",
    kind: "network-device",
    icon: "F",
    ports: [],
    software: [],
  },
  {
    id: "switch",
    category: "Network Devices",
    label: "Switch",
    os: "Network Appliance",
    version: "managed",
    kind: "network-device",
    icon: "S",
    ports: [],
    software: [],
  },
  {
    id: "web-server",
    category: "Services",
    label: "Web Server",
    os: "Ubuntu",
    version: "22.04",
    kind: "service",
    icon: "H",
    ports: [80, 443],
    software: [{ name: "nginx", version: "1.14.0", cves: ["CVE-2021-23017"] }],
  },
  {
    id: "database",
    category: "Services",
    label: "Database",
    os: "Ubuntu",
    version: "22.04",
    kind: "service",
    icon: "D",
    ports: [3306],
    software: [{ name: "mysql", version: "5.6", cves: ["CVE-2016-6662"] }],
  },
  {
    id: "active-directory",
    category: "Services",
    label: "Active Directory",
    os: "Windows Server",
    version: "2019",
    kind: "service",
    icon: "A",
    ports: [53, 88, 389, 445],
    software: [{ name: "windows", version: "server-2019", cves: [] }],
  },
  {
    id: "mail",
    category: "Services",
    label: "Mail Server",
    os: "Debian",
    version: "11",
    kind: "service",
    icon: "M",
    ports: [25, 143, 587],
    software: [{ name: "apache", version: "2.4.58", cves: [] }],
  },
];

const categories: BuilderCategory[] = [
  "Attacker Machines",
  "Target Machines",
  "Network Devices",
  "Services",
];

const defaultRule: ConnectionRule = {
  protocol: "TCP",
  action: "allow",
  ports: [80, 443],
  direction: "bidirectional",
};

const nodeTypes: NodeTypes = {
  machine: MachineNode,
  networkDevice: NetworkDeviceNode,
};

type BuilderNode = Node<MachineNodeData>;
type BuilderEdge = Edge<BuilderEdgeData>;

function cvesForSoftware(software: SoftwareConfig[]): string[] {
  return software.flatMap((item) => CVE_MAP[`${item.name}-${item.version}`] ?? []);
}

function paletteTemplateToNodeData(
  template: BuilderMachineTemplate,
  index: number
): MachineNodeData {
  const software = template.software.map((item) => ({
    ...item,
    cves: CVE_MAP[`${item.name}-${item.version}`] ?? [],
  }));

  return {
    label: template.label,
    os: template.os,
    version: template.version,
    ip: `10.10.0.${index + 10}`,
    ports: template.ports,
    cves: cvesForSoftware(software),
    isFlag: false,
    flagValue: "",
    software,
    kind: template.kind,
    icon: template.icon,
  };
}

function BuilderPageContent() {
  const router = useRouter();
  const { toast } = useToast();
  const { screenToFlowPosition } = useReactFlow<BuilderNode, BuilderEdge>();
  const [nodes, setNodes, onNodesChange] = useNodesState<BuilderNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<BuilderEdge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<CustomLabTopology[]>([]);
  const [templateName, setTemplateName] = useState("Custom enterprise range");
  const [templateDescription, setTemplateDescription] = useState(
    "Multi-host cyber range topology"
  );
  const [templateCategory, setTemplateCategory] = useState("Custom");
  const [templateDifficulty, setTemplateDifficulty] = useState("Medium");
  const [portInput, setPortInput] = useState("");

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const estimatedCredits = Math.max(2, nodes.length * 2 + edges.length);
  const estimatedCostPerHour = Number((nodes.length * 0.18 + edges.length * 0.02).toFixed(2));

  const buildTopology = useCallback(
    (name = templateName, description = templateDescription): CustomLabTopology => ({
      id: crypto.randomUUID(),
      name,
      description,
      category: templateCategory,
      difficulty: templateDifficulty,
      estimated_cost_per_hour: estimatedCostPerHour,
      estimated_credits: estimatedCredits,
      machines: nodes.map((node) => ({
        id: node.id,
        position: node.position,
        data: node.data,
      })),
      connections: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        data: edge.data ?? { label: "TCP allow", rules: [defaultRule] },
      })),
    }),
    [
      edges,
      estimatedCostPerHour,
      estimatedCredits,
      nodes,
      templateCategory,
      templateDescription,
      templateDifficulty,
      templateName,
    ]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((currentEdges) =>
        addEdge<BuilderEdge>(
          {
            ...connection,
            animated: false,
            data: { label: "TCP allow", rules: [defaultRule] },
            style: { stroke: "#3f3f46" },
          },
          currentEdges
        )
      );
      toast({ title: "Network link added", tone: "success" });
    },
    [setEdges, toast]
  );

  const onNodeClick: NodeMouseHandler<BuilderNode> = useCallback((_, node) => {
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }, []);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: BuilderEdge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, []);

  const onDragStart = (
    event: DragEvent<HTMLButtonElement>,
    template: BuilderMachineTemplate
  ) => {
    event.dataTransfer.setData("application/orchestryx-template", template.id);
    event.dataTransfer.effectAllowed = "move";
  };

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const templateId = event.dataTransfer.getData("application/orchestryx-template");
      const template = MACHINE_TEMPLATES.find((item) => item.id === templateId);

      if (!template) {
        return;
      }

      const id = `${template.id}-${crypto.randomUUID()}`;
      const node: BuilderNode = {
        id,
        type: template.kind === "network-device" ? "networkDevice" : "machine",
        position: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
        data: paletteTemplateToNodeData(template, nodes.length),
      };

      setNodes((currentNodes) => [...currentNodes, node]);
      setSelectedNodeId(id);
      setSelectedEdgeId(null);
      toast({ title: "Machine added", description: template.label, tone: "success" });
    },
    [nodes.length, screenToFlowPosition, setNodes, toast]
  );

  const updateSelectedNodeData = (updater: (data: MachineNodeData) => MachineNodeData) => {
    if (!selectedNodeId) return;
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === selectedNodeId ? { ...node, data: updater(node.data) } : node
      )
    );
  };

  const updateSelectedEdgeData = (updater: (data: BuilderEdgeData) => BuilderEdgeData) => {
    if (!selectedEdgeId) return;
    setEdges((currentEdges) =>
      currentEdges.map((edge) =>
        edge.id === selectedEdgeId
          ? { ...edge, data: updater(edge.data ?? { label: "TCP allow", rules: [defaultRule] }) }
          : edge
      )
    );
  };

  const updateSoftwareVersion = (name: string, version: string) => {
    updateSelectedNodeData((data) => {
      const software = data.software.map((item) =>
        item.name === name
          ? { ...item, version, cves: CVE_MAP[`${name}-${version}`] ?? [] }
          : item
      );
      return { ...data, software, cves: cvesForSoftware(software) };
    });
  };

  const addPort = () => {
    const nextPort = Number(portInput);
    if (!Number.isInteger(nextPort) || nextPort <= 0 || nextPort > 65535) {
      toast({ title: "Invalid port", description: "Use a TCP/UDP port from 1 to 65535.", tone: "error" });
      return;
    }

    updateSelectedNodeData((data) => ({
      ...data,
      ports: Array.from(new Set([...data.ports, nextPort])).sort((a, b) => a - b),
    }));
    setPortInput("");
  };

  const clearCanvas = () => {
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    toast({ title: "Canvas cleared", tone: "info" });
  };

  const exportJson = () => {
    const topology = buildTopology();
    const blob = new Blob([JSON.stringify(topology, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${topology.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast({ title: "Topology exported", tone: "success" });
  };

  const saveTemplate = () => {
    const topology = buildTopology();
    setSavedTemplates((current) => [topology, ...current]);
    setSaveOpen(false);
    toast({ title: "Template saved locally", description: topology.name, tone: "success" });
  };

  const deployNow = async () => {
    setIsDeploying(true);
    try {
      const result = await startCustomLab(buildTopology());
      toast({
        title: "Custom lab launch requested",
        description: `${result.template} is provisioning.`,
        tone: "success",
      });
      router.push(`/labs/${result.instance_id}` as Route);
    } catch (error) {
      toast({
        title: "Unable to deploy topology",
        description: extractApiErrorMessage(error),
        tone: "error",
      });
    } finally {
      setIsDeploying(false);
      setDeployOpen(false);
    }
  };

  const groupedTemplates = useMemo(
    () =>
      categories.map((category) => ({
        category,
        items: MACHINE_TEMPLATES.filter((template) => template.category === category),
      })),
    []
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-3xl text-foreground">Lab Builder</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Design AWS-backed cyber range topologies with machines, services, and network policy before deployment.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
            <Button type="button" variant="secondary" onClick={() => setSaveOpen(true)}>
              <Save className="h-4 w-4" />
              Save Template
            </Button>
            <SaveTemplateDialog
              name={templateName}
              description={templateDescription}
              category={templateCategory}
              difficulty={templateDifficulty}
              setName={setTemplateName}
              setDescription={setTemplateDescription}
              setCategory={setTemplateCategory}
              setDifficulty={setTemplateDifficulty}
              onSave={saveTemplate}
            />
          </Dialog>
          <Dialog open={deployOpen} onOpenChange={setDeployOpen}>
            <Button type="button" onClick={() => setDeployOpen(true)} disabled={!nodes.length}>
              <Rocket className="h-4 w-4" />
              Deploy Now
            </Button>
            <DeployDialog
              machineCount={nodes.length}
              connectionCount={edges.length}
              estimatedCredits={estimatedCredits}
              estimatedCostPerHour={estimatedCostPerHour}
              isDeploying={isDeploying}
              onDeploy={deployNow}
            />
          </Dialog>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="secondary" onClick={clearCanvas}>
                <Eraser className="h-4 w-4" />
                Clear Canvas
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove all machines and links from this topology.</TooltipContent>
          </Tooltip>
          <Button type="button" variant="secondary" onClick={exportJson} disabled={!nodes.length}>
            <Download className="h-4 w-4" />
            Export JSON
          </Button>
        </div>
      </header>

      <section className="grid min-h-[720px] gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="app-card overflow-hidden">
          <div className="border-b border-border p-4">
            <h2 className="text-sm font-medium text-foreground">Machine palette</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {savedTemplates.length} saved locally
            </p>
          </div>
          <div className="max-h-[650px] space-y-5 overflow-y-auto p-4">
            {groupedTemplates.map((group) => (
              <div key={group.category}>
                <p className="mb-2 text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  {group.category}
                </p>
                <div className="grid gap-2">
                  {group.items.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      draggable
                      onDragStart={(event) => onDragStart(event, template)}
                      className="rounded-lg border border-border bg-secondary/45 p-3 text-left hover:border-primary/70 hover:bg-secondary"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-foreground">{template.label}</span>
                        <Badge>{template.version}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{template.os}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className="relative overflow-hidden rounded-xl border border-border bg-card">
          <div
            className="h-[720px]"
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={onDrop}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onEdgeClick={onEdgeClick}
              onPaneClick={onPaneClick}
              fitView
              className="builder-grid"
            >
              <Background color="#1e1e2a" gap={24} variant={BackgroundVariant.Dots} />
              <Controls />
              <MiniMap
                nodeColor={(node) => (node.type === "networkDevice" ? "#4f46e5" : "#22c55e")}
                maskColor="rgba(10, 10, 15, 0.72)"
              />
            </ReactFlow>
          </div>

          <TopologySummary
            machineCount={nodes.length}
            connectionCount={edges.length}
            estimatedCredits={estimatedCredits}
          />

          {selectedNode ? (
            <MachineConfigPanel
              node={selectedNode}
              portInput={portInput}
              setPortInput={setPortInput}
              onClose={() => setSelectedNodeId(null)}
              onChange={updateSelectedNodeData}
              onSoftwareVersionChange={updateSoftwareVersion}
              onAddPort={addPort}
            />
          ) : null}

          {selectedEdge ? (
            <ConnectionConfigPanel
              edge={selectedEdge}
              onClose={() => setSelectedEdgeId(null)}
              onChange={updateSelectedEdgeData}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}

function TopologySummary({
  machineCount,
  connectionCount,
  estimatedCredits,
}: {
  machineCount: number;
  connectionCount: number;
  estimatedCredits: number;
}) {
  return (
    <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-2">
      <Badge tone="blue">{machineCount} machines</Badge>
      <Badge>{connectionCount} links</Badge>
      <Badge tone="green">{estimatedCredits} credits</Badge>
    </div>
  );
}

function MachineConfigPanel({
  node,
  portInput,
  setPortInput,
  onClose,
  onChange,
  onSoftwareVersionChange,
  onAddPort,
}: {
  node: BuilderNode;
  portInput: string;
  setPortInput: (value: string) => void;
  onClose: () => void;
  onChange: (updater: (data: MachineNodeData) => MachineNodeData) => void;
  onSoftwareVersionChange: (name: string, version: string) => void;
  onAddPort: () => void;
}) {
  return (
    <motion.aside
      initial={{ x: 360, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 360, opacity: 0 }}
      className="absolute bottom-0 right-0 top-0 z-20 w-full max-w-sm overflow-y-auto border-l border-border bg-card/95 p-5 backdrop-blur"
    >
      <PanelHeader title="Machine config" onClose={onClose} />
      <div className="mt-5 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="machine-name">Machine name</Label>
          <Input
            id="machine-name"
            value={node.data.label}
            onChange={(event) => onChange((data) => ({ ...data, label: event.target.value }))}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoBlock label="OS" value={node.data.os} />
          <InfoBlock label="Version" value={node.data.version} />
        </div>
        <div className="space-y-3">
          <Label>Software</Label>
          {node.data.software.length ? (
            node.data.software.map((item) => {
              const versions = SOFTWARE_VERSIONS[item.name] ?? [item.version];
              const cves = CVE_MAP[`${item.name}-${item.version}`] ?? [];
              return (
                <div key={item.name} className="rounded-lg border border-border bg-secondary/45 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-foreground">{item.name}</span>
                    <select
                      value={item.version}
                      onChange={(event) => onSoftwareVersionChange(item.name, event.target.value)}
                      className="focus-ring rounded-lg border border-input bg-background px-2 py-1 text-sm text-foreground"
                    >
                      {versions.map((version) => (
                        <option key={version} value={version}>
                          {version}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-3">
                    {cves.length ? (
                      <Badge tone="red">
                        <ShieldAlert className="mr-1 h-3 w-3" />
                        {cves.join(", ")}
                      </Badge>
                    ) : (
                      <Badge tone="green">No known CVEs</Badge>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="rounded-lg border border-border bg-secondary/45 p-3 text-sm text-muted-foreground">
              No software stack configured.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="machine-ip">IP address</Label>
          <Input
            id="machine-ip"
            className="mono"
            value={node.data.ip}
            onChange={(event) => onChange((data) => ({ ...data, ip: event.target.value }))}
          />
        </div>
        <div className="space-y-3">
          <Label>Exposed ports</Label>
          <div className="flex flex-wrap gap-2">
            {node.data.ports.map((port) => (
              <button
                key={port}
                type="button"
                onClick={() =>
                  onChange((data) => ({
                    ...data,
                    ports: data.ports.filter((item) => item !== port),
                  }))
                }
                className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-foreground hover:border-destructive/45 hover:text-destructive"
              >
                {port}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={portInput}
              onChange={(event) => setPortInput(event.target.value)}
              placeholder="443"
              inputMode="numeric"
            />
            <Button type="button" variant="secondary" onClick={onAddPort}>
              Add
            </Button>
          </div>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/45 p-3 text-sm">
          <span className="flex items-center gap-2 text-foreground">
            <Flag className="h-4 w-4 text-warning" />
            Flag target
          </span>
          <input
            type="checkbox"
            checked={node.data.isFlag}
            onChange={(event) => onChange((data) => ({ ...data, isFlag: event.target.checked }))}
            className="h-4 w-4 accent-primary"
          />
        </label>
        {node.data.isFlag ? (
          <div className="space-y-2">
            <Label htmlFor="flag-value">Custom flag value</Label>
            <Input
              id="flag-value"
              value={node.data.flagValue}
              onChange={(event) => onChange((data) => ({ ...data, flagValue: event.target.value }))}
              placeholder="ORX{...}"
            />
          </div>
        ) : null}
      </div>
    </motion.aside>
  );
}

function ConnectionConfigPanel({
  edge,
  onClose,
  onChange,
}: {
  edge: BuilderEdge;
  onClose: () => void;
  onChange: (updater: (data: BuilderEdgeData) => BuilderEdgeData) => void;
}) {
  const rule = (edge.data?.rules ?? [defaultRule])[0] ?? defaultRule;

  const updateRule = (nextRule: ConnectionRule) => {
    onChange(() => ({ label: `${nextRule.protocol} ${nextRule.action}`, rules: [nextRule] }));
  };

  return (
    <motion.aside
      initial={{ x: 360, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="absolute bottom-0 right-0 top-0 z-20 w-full max-w-sm overflow-y-auto border-l border-border bg-card/95 p-5 backdrop-blur"
    >
      <PanelHeader title="Connection rules" onClose={onClose} />
      <div className="mt-5 space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoBlock label="Source" value={edge.source} mono />
          <InfoBlock label="Target" value={edge.target} mono />
        </div>
        <SelectField
          label="Protocol"
          value={rule.protocol}
          options={["TCP", "UDP", "ICMP"]}
          onChange={(value) => updateRule({ ...rule, protocol: value as ConnectionProtocol })}
        />
        <SelectField
          label="Port action"
          value={rule.action}
          options={["allow", "deny"]}
          onChange={(value) => updateRule({ ...rule, action: value as ConnectionAction })}
        />
        <SelectField
          label="Direction"
          value={rule.direction}
          options={["bidirectional", "unidirectional"]}
          onChange={(value) =>
            updateRule({ ...rule, direction: value as ConnectionDirection })
          }
        />
        <div className="space-y-2">
          <Label htmlFor="edge-ports">Ports</Label>
          <Input
            id="edge-ports"
            value={rule.ports.join(", ")}
            onChange={(event) =>
              updateRule({
                ...rule,
                ports: event.target.value
                  .split(",")
                  .map((item) => Number(item.trim()))
                  .filter((item) => Number.isInteger(item) && item > 0),
              })
            }
            placeholder="80, 443"
          />
        </div>
      </div>
    </motion.aside>
  );
}

function SaveTemplateDialog({
  name,
  description,
  category,
  difficulty,
  setName,
  setDescription,
  setCategory,
  setDifficulty,
  onSave,
}: {
  name: string;
  description: string;
  category: string;
  difficulty: string;
  setName: (value: string) => void;
  setDescription: (value: string) => void;
  setCategory: (value: string) => void;
  setDifficulty: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Save template</DialogTitle>
        <DialogDescription>
          Saved templates stay in local UI state for this MVP.
        </DialogDescription>
      </DialogHeader>
      <div className="mt-5 space-y-4">
        <TextField label="Template name" value={name} onChange={setName} />
        <TextField label="Description" value={description} onChange={setDescription} />
        <TextField label="Category" value={category} onChange={setCategory} />
        <TextField label="Difficulty" value={difficulty} onChange={setDifficulty} />
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="secondary">Cancel</Button>
        </DialogClose>
        <Button type="button" onClick={onSave}>Save Template</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function DeployDialog({
  machineCount,
  connectionCount,
  estimatedCostPerHour,
  estimatedCredits,
  isDeploying,
  onDeploy,
}: {
  machineCount: number;
  connectionCount: number;
  estimatedCostPerHour: number;
  estimatedCredits: number;
  isDeploying: boolean;
  onDeploy: () => void;
}) {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Deploy custom topology</DialogTitle>
        <DialogDescription>
          This submits the topology payload to the existing lab start endpoint.
        </DialogDescription>
      </DialogHeader>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <InfoBlock label="Machines" value={String(machineCount)} />
        <InfoBlock label="Connections" value={String(connectionCount)} />
        <InfoBlock label="Estimated cost/hr" value={`$${estimatedCostPerHour.toFixed(2)}`} />
        <InfoBlock label="Estimated credits" value={String(estimatedCredits)} />
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="secondary">Cancel</Button>
        </DialogClose>
        <Button type="button" onClick={onDeploy} disabled={isDeploying || machineCount === 0}>
          {isDeploying ? "Deploying..." : "Confirm deploy"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg text-foreground">{title}</h2>
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
        aria-label="Close panel"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function InfoBlock({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/45 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 truncate text-sm text-foreground", mono && "mono")}>{value}</p>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="focus-ring h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function BuilderPage() {
  return (
    <ReactFlowProvider>
      <BuilderPageContent />
      <div className="sr-only">
        <Link href="/catalog">Catalog</Link>
      </div>
    </ReactFlowProvider>
  );
}
