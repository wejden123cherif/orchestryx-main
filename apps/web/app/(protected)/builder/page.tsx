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
import { AnimatePresence, motion } from "framer-motion";
import {
  Download,
  Eraser,
  Link2,
  MousePointer2,
  Plus,
  Rocket,
  Save,
  Search,
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
    icon: "💻",
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
    icon: "🧪",
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
    icon: "🖥️",
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
    icon: "🪟",
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
    icon: "🪟",
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
    icon: "▣",
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
    icon: "◆",
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
    icon: "↔️",
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
    icon: "🛡️",
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
    icon: "🔀",
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
    icon: "🌐",
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
    icon: "🗄️",
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
    icon: "🏢",
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
    icon: "✉️",
    ports: [25, 143, 587],
    software: [{ name: "apache", version: "2.4.58", cves: [] }],
  },
];

type PaletteGroupId = "attackers" | "machines" | "network" | "services";

const paletteGroups: Array<{
  id: PaletteGroupId;
  label: string;
  emoji: string;
  description: string;
  match: (template: BuilderMachineTemplate) => boolean;
}> = [
  {
    id: "attackers",
    label: "Attackers",
    emoji: "💻",
    description: "Operator workstations and testing boxes",
    match: (template) => template.category === "Attacker Machines",
  },
  {
    id: "machines",
    label: "Machines",
    emoji: "🖥️",
    description: "Linux and Windows target hosts",
    match: (template) => template.category === "Target Machines",
  },
  {
    id: "network",
    label: "Network",
    emoji: "🔀",
    description: "Routers, switches, and boundary controls",
    match: (template) => template.category === "Network Devices",
  },
  {
    id: "services",
    label: "Apps",
    emoji: "📦",
    description: "Web apps, databases, identity, and services",
    match: (template) => template.category === "Services",
  },
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

function makeDefaultEdge(source: string, target: string, animated = false): BuilderEdge {
  return {
    id: `${source}-${target}-${crypto.randomUUID()}`,
    source,
    target,
    animated,
    data: { label: "TCP allow", rules: [defaultRule] },
    style: {
      stroke: "color-mix(in srgb, var(--primary) 72%, #64748b)",
      strokeWidth: 1.8,
    },
  };
}

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
  const [activePaletteGroup, setActivePaletteGroup] = useState<PaletteGroupId>("attackers");
  const [paletteSearch, setPaletteSearch] = useState("");

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
            animated: true,
            data: { label: "TCP allow", rules: [defaultRule] },
            style: {
              stroke: "color-mix(in srgb, var(--primary) 72%, #64748b)",
              strokeWidth: 1.8,
            },
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

  const addTemplateToCanvas = useCallback(
    (template: BuilderMachineTemplate, position?: { x: number; y: number }) => {
      const id = `${template.id}-${crypto.randomUUID()}`;

      setNodes((currentNodes) => {
        const index = currentNodes.length;
        const node: BuilderNode = {
          id,
          type: template.kind === "network-device" ? "networkDevice" : "machine",
          position:
            position ?? {
              x: 120 + (index % 3) * 230,
              y: 120 + Math.floor(index / 3) * 150,
            },
          data: paletteTemplateToNodeData(template, index),
        };

        return [...currentNodes, node];
      });
      setSelectedNodeId(id);
      setSelectedEdgeId(null);
      toast({ title: "Asset added", description: template.label, tone: "success" });
    },
    [setNodes, toast]
  );

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

      addTemplateToCanvas(template, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    },
    [addTemplateToCanvas, screenToFlowPosition]
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

  const autoLinkTopology = useCallback(() => {
    if (nodes.length < 2) {
      toast({ title: "Add at least two assets", description: "Auto link needs two or more nodes.", tone: "info" });
      return;
    }

    const networkHub = nodes.find((node) => node.data.kind === "network-device");
    const proposedPairs = networkHub
      ? nodes
          .filter((node) => node.id !== networkHub.id)
          .map((node) => [networkHub.id, node.id] as const)
      : [...nodes]
          .sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x))
          .slice(1)
          .map((node, index, sortedNodes) => {
            const source = index === 0
              ? [...nodes].sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x))[0]
              : sortedNodes[index - 1];
            return [source.id, node.id] as const;
          });

    const existingPairs = new Set(
      edges.flatMap((edge) => [`${edge.source}->${edge.target}`, `${edge.target}->${edge.source}`])
    );
    const nextEdges = proposedPairs
      .filter(([source, target]) => !existingPairs.has(`${source}->${target}`))
      .map(([source, target]) => makeDefaultEdge(source, target, true));

    if (!nextEdges.length) {
      toast({ title: "Topology already linked", description: "No missing links were found.", tone: "info" });
      return;
    }

    setEdges((currentEdges) => [...currentEdges, ...nextEdges]);
    toast({ title: "Auto link complete", description: `${nextEdges.length} connection${nextEdges.length === 1 ? "" : "s"} added.`, tone: "success" });
  }, [edges, nodes, setEdges, toast]);

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

  const activePalette = paletteGroups.find((group) => group.id === activePaletteGroup) ?? paletteGroups[0];
  const paletteTemplates = useMemo(() => {
    const query = paletteSearch.trim().toLowerCase();
    return MACHINE_TEMPLATES.filter((template) => {
      const matchesGroup = activePalette.match(template);
      const matchesSearch =
        !query ||
        [template.label, template.os, template.version, template.category, template.software.map((item) => item.name).join(" ")]
          .join(" ")
          .toLowerCase()
          .includes(query);

      return matchesGroup && matchesSearch;
    });
  }, [activePalette, paletteSearch]);

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Lab Builder</h1>
            <Badge tone="blue">Private topology</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-[13px] text-muted-foreground">
            Compose machines, apps, and network controls, then deploy through the existing private lab launch flow.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
            <Button type="button" variant="secondary" size="sm" onClick={() => setSaveOpen(true)}>
              <Save className="h-4 w-4" />
              Save
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
            <Button type="button" size="sm" onClick={() => setDeployOpen(true)} disabled={!nodes.length}>
              <Rocket className="h-4 w-4" />
              Deploy
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
              <Button type="button" variant="secondary" size="sm" onClick={autoLinkTopology} disabled={nodes.length < 2}>
                <Link2 className="h-4 w-4" />
                Auto link
              </Button>
            </TooltipTrigger>
            <TooltipContent>Connect hosts to a network device, or chain them when no network node exists.</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="secondary" size="sm" onClick={clearCanvas}>
                <Eraser className="h-4 w-4" />
                Clear
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove all machines and links from this topology.</TooltipContent>
          </Tooltip>
          <Button type="button" variant="secondary" size="sm" onClick={exportJson} disabled={!nodes.length}>
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </header>

      <section className="grid min-h-[720px] gap-3 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <PaletteSidebar
          activeGroup={activePaletteGroup}
          activePalette={activePalette}
          groups={paletteGroups}
          templates={paletteTemplates}
          search={paletteSearch}
          savedCount={savedTemplates.length}
          onSearch={setPaletteSearch}
          onSelectGroup={setActivePaletteGroup}
          onAddTemplate={addTemplateToCanvas}
          onDragStart={onDragStart}
        />

        <div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-[var(--card-shadow)]">
          <div className="absolute left-4 right-4 top-4 z-10 flex flex-wrap items-center justify-between gap-2">
            <TopologySummary
              machineCount={nodes.length}
              connectionCount={edges.length}
              estimatedCredits={estimatedCredits}
            />
            <div className="pointer-events-none hidden items-center gap-2 rounded-full border border-border bg-card/85 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur md:flex">
              <MousePointer2 className="h-3.5 w-3.5" />
              Click assets to add, drag to place, click nodes for settings
            </div>
          </div>
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
              className="builder-grid bg-background/40"
            >
              <Background color="color-mix(in srgb, var(--border) 70%, transparent)" gap={22} variant={BackgroundVariant.Dots} />
              <Controls />
              <MiniMap
                nodeColor={(node) => (node.type === "networkDevice" ? "#38bdf8" : "#34d399")}
                maskColor="rgba(10, 10, 15, 0.72)"
              />
            </ReactFlow>
          </div>

          <AnimatePresence>
            {selectedNode ? (
              <MachineConfigPanel
                key={selectedNode.id}
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
                key={selectedEdge.id}
                edge={selectedEdge}
                onClose={() => setSelectedEdgeId(null)}
                onChange={updateSelectedEdgeData}
              />
            ) : null}
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
}

function PaletteSidebar({
  activeGroup,
  activePalette,
  groups,
  templates,
  search,
  savedCount,
  onSearch,
  onSelectGroup,
  onAddTemplate,
  onDragStart,
}: {
  activeGroup: PaletteGroupId;
  activePalette: (typeof paletteGroups)[number];
  groups: typeof paletteGroups;
  templates: BuilderMachineTemplate[];
  search: string;
  savedCount: number;
  onSearch: (value: string) => void;
  onSelectGroup: (value: PaletteGroupId) => void;
  onAddTemplate: (template: BuilderMachineTemplate) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, template: BuilderMachineTemplate) => void;
}) {
  return (
    <aside className="app-card grid min-h-[720px] overflow-hidden lg:grid-cols-[4.25rem_minmax(0,1fr)]">
      <div className="flex border-b border-border bg-secondary/30 p-2 lg:flex-col lg:border-b-0 lg:border-r">
        {groups.map((group) => {
          const active = group.id === activeGroup;
          const count = MACHINE_TEMPLATES.filter(group.match).length;
          return (
            <Tooltip key={group.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onSelectGroup(group.id)}
                  className={cn(
                    "relative flex h-12 min-w-12 flex-1 flex-col items-center justify-center rounded-lg text-lg transition lg:flex-none",
                    active
                      ? "bg-primary/12 text-primary shadow-sm"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                  aria-label={group.label}
                >
                  <span aria-hidden>{group.emoji}</span>
                  <span className="mt-0.5 text-[10px] font-medium tabular-nums">{count}</span>
                  {active ? <span className="absolute bottom-0 h-0.5 w-6 rounded-full bg-primary lg:bottom-auto lg:right-0 lg:h-6 lg:w-0.5" /> : null}
                </button>
              </TooltipTrigger>
              <TooltipContent>{group.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <div className="flex min-w-0 flex-col">
        <div className="border-b border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xl" aria-hidden>{activePalette.emoji}</span>
                <h2 className="truncate text-sm font-semibold text-foreground">{activePalette.label}</h2>
              </div>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{activePalette.description}</p>
            </div>
            <Badge>{savedCount} saved</Badge>
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Search assets..."
              className="h-9 pl-8 text-[12px]"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {templates.length ? (
            <div className="grid gap-2">
              {templates.map((template) => {
                const cves = cvesForSoftware(template.software);
                return (
                  <button
                    key={template.id}
                    type="button"
                    draggable
                    onDragStart={(event) => onDragStart(event, template)}
                    onClick={() => onAddTemplate(template)}
                    className="group rounded-lg border border-border bg-secondary/30 p-3 text-left transition hover:border-primary/35 hover:bg-secondary/60"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-lg">
                        {template.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-[13px] font-semibold text-foreground">{template.label}</span>
                          <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground/45 transition group-hover:text-primary" />
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {template.os} · {template.version}
                        </span>
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {template.ports.slice(0, 4).map((port) => (
                        <Badge key={port} className="h-5 px-1.5 text-[10px]">{port}</Badge>
                      ))}
                      {template.software.slice(0, 2).map((item) => (
                        <Badge key={`${template.id}-${item.name}`} tone="blue" className="h-5 px-1.5 text-[10px]">
                          {item.name}
                        </Badge>
                      ))}
                      {cves.length ? (
                        <Badge tone="red" className="h-5 px-1.5 text-[10px]">{cves.length} CVE</Badge>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-secondary/25 p-6 text-center">
              <Search className="mx-auto h-5 w-5 text-muted-foreground/55" />
              <p className="mt-2 text-sm font-medium text-foreground">No assets found</p>
              <p className="mt-1 text-xs text-muted-foreground">Try another category or search term.</p>
            </div>
          )}
        </div>
      </div>
    </aside>
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
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="absolute bottom-0 right-0 top-0 z-20 w-full max-w-[22rem] overflow-y-auto border-l border-border bg-card/95 p-4 shadow-2xl backdrop-blur"
    >
      <PanelHeader title="Asset settings" subtitle={node.data.label} onClose={onClose} />
      <div className="mt-4 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="machine-name">Machine name</Label>
          <Input
            id="machine-name"
            value={node.data.label}
            onChange={(event) => onChange((data) => ({ ...data, label: event.target.value }))}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <InfoBlock label="OS" value={node.data.os} />
          <InfoBlock label="Version" value={node.data.version} />
        </div>
        <div className="space-y-2.5">
          <Label>Software</Label>
          {node.data.software.length ? (
            node.data.software.map((item) => {
              const versions = SOFTWARE_VERSIONS[item.name] ?? [item.version];
              const cves = CVE_MAP[`${item.name}-${item.version}`] ?? [];
              return (
                <div key={item.name} className="rounded-lg border border-border bg-secondary/35 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-foreground">{item.name}</span>
                    <select
                      value={item.version}
                      onChange={(event) => onSoftwareVersionChange(item.name, event.target.value)}
                      className="focus-ring h-8 rounded-lg border border-input bg-background px-2 text-xs text-foreground"
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
        <div className="space-y-2.5">
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
      exit={{ x: 360, opacity: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="absolute bottom-0 right-0 top-0 z-20 w-full max-w-[22rem] overflow-y-auto border-l border-border bg-card/95 p-4 shadow-2xl backdrop-blur"
    >
      <PanelHeader title="Link settings" subtitle={edge.data?.label ?? "TCP allow"} onClose={onClose} />
      <div className="mt-4 space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
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

function PanelHeader({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {subtitle ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{subtitle}</p> : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
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
    <div className="rounded-lg border border-border bg-secondary/35 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("mt-1 truncate text-[13px] font-medium text-foreground", mono && "mono")}>{value}</p>
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
