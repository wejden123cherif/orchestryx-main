"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  AppLayout,
  Badge,
  Box,
  BreadcrumbGroup,
  Button,
  ButtonDropdown,
  Cards,
  CollectionPreferences,
  ColumnLayout,
  Container,
  ContentLayout,
  CopyToClipboard,
  Flashbar,
  FormField,
  Header,
  HelpPanel,
  KeyValuePairs,
  Link,
  Modal,
  Pagination,
  PropertyFilter,
  Select,
  SideNavigation,
  SpaceBetween,
  Spinner,
  SplitPanel,
  StatusIndicator,
  Table,
  Tabs,
  Textarea,
  TopNavigation,
} from "@cloudscape-design/components";
import type { FlashbarProps } from "@cloudscape-design/components/flashbar";
import type { PropertyFilterProps } from "@cloudscape-design/components/property-filter";
import type { TableProps } from "@cloudscape-design/components/table";
import {
  adjustAdminUserCredits,
  adminExtendLabTtl,
  adminStopLab,
  extractApiErrorMessage,
  getAdminAwsLogs,
  getAdminAwsOverview,
  getAdminCreditTransactions,
  getAdminEvents,
  getAdminLabs,
  getAdminOverview,
  getAdminProvisioningJobs,
  getAdminUsers,
} from "@/lib/api";
import type {
  AdminLab,
  AdminOverview,
  AdminUser,
  AwsInstance,
  AwsLoadBalancer,
  AwsOverview,
  AwsSecurityGroup,
  AwsTargetGroup,
  CreditTransaction,
  LabEvent,
  ProvisioningJob,
} from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

type AdminSection =
  | "overview"
  | "compute"
  | "networking"
  | "security"
  | "storage"
  | "labs"
  | "users"
  | "billing"
  | "jobs"
  | "logs"
  | "settings";

type InspectorResource =
  | { type: "EC2 instance"; title: string; subtitle: string; item: AwsInstance }
  | { type: "Security group"; title: string; subtitle: string; item: AwsSecurityGroup }
  | { type: "Lab"; title: string; subtitle: string; item: AdminLab }
  | { type: "User"; title: string; subtitle: string; item: AdminUser }
  | { type: "Provisioning job"; title: string; subtitle: string; item: ProvisioningJob }
  | { type: "Load balancer"; title: string; subtitle: string; item: AwsLoadBalancer }
  | { type: "Target group"; title: string; subtitle: string; item: AwsTargetGroup };

const sectionLabels: Record<AdminSection, string> = {
  overview: "Overview",
  compute: "Compute",
  networking: "Networking",
  security: "Security Groups",
  storage: "Storage",
  labs: "Labs",
  users: "Users",
  billing: "Credits / Billing",
  jobs: "Provisioning Jobs",
  logs: "Logs / Debug",
  settings: "Settings",
};

const defaultQuery: PropertyFilterProps.Query = { tokens: [], operation: "and" };

function fmt(value?: string | null): string {
  return value ? formatDateTime(value) : "Unavailable";
}

function money(value?: number | null): string {
  return typeof value === "number" ? `$${value.toFixed(2)}` : "n/a";
}

function compact(value?: string | null, chars = 16): string {
  if (!value) return "-";
  return value.length > chars ? `${value.slice(0, chars)}...` : value;
}

function statusType(value?: string | null): "success" | "warning" | "error" | "info" {
  const normalized = String(value ?? "").toUpperCase();
  if (["FAILED", "ERROR", "ALARM", "ROLLBACK_COMPLETE", "HIGH"].includes(normalized)) return "error";
  if (["QUEUED", "PROVISIONING", "STARTING", "DESTROYING", "MEDIUM", "LAGGING", "ATTENTION"].includes(normalized)) return "warning";
  if (["READY", "RUNNING", "ACTIVE", "OK", "LOW", "LIVE", "CREATE_COMPLETE"].includes(normalized)) return "success";
  return "info";
}

function Status({ value }: { value?: string | null }) {
  return <StatusIndicator type={statusType(value)}>{value ?? "unknown"}</StatusIndicator>;
}

function RiskBadge({ value }: { value?: string | null }) {
  const color = value === "high" ? "red" : value === "medium" ? "severity-medium" : "green";
  return <Badge color={color}>{value ?? "low"}</Badge>;
}

function ConsoleLink({ href, label = "Open in AWS Console" }: { href?: string; label?: string }) {
  if (!href) return <Box color="text-status-inactive">No console link</Box>;
  return (
    <Link href={href} external>
      {label}
    </Link>
  );
}

function tokenValue(token: PropertyFilterProps.Query["tokens"][number]): string {
  if (Array.isArray(token.value)) return token.value.join(" ");
  return String(token.value ?? "");
}

function matchesQuery<T>(
  item: T,
  query: PropertyFilterProps.Query,
  freeText: (item: T) => string,
  fields: Record<string, (item: T) => string | number | null | undefined>
): boolean {
  if (!query.tokens.length) return true;
  const checks = query.tokens.map((token) => {
    const needle = tokenValue(token).toLowerCase();
    if (!needle) return true;
    const source = token.propertyKey && fields[token.propertyKey] ? String(fields[token.propertyKey](item) ?? "") : freeText(item);
    const haystack = source.toLowerCase();
    const contains = haystack.includes(needle);
    return token.operator === "!:" || token.operator === "!=" ? !contains : contains;
  });
  return query.operation === "or" ? checks.some(Boolean) : checks.every(Boolean);
}

function usePagedItems<T>(
  items: T[],
  pageSize: number,
  query: PropertyFilterProps.Query,
  freeText: (item: T) => string,
  fields: Record<string, (item: T) => string | number | null | undefined>
) {
  const [currentPageIndex, setCurrentPageIndex] = useState(1);
  const filtered = useMemo(() => items.filter((item) => matchesQuery(item, query, freeText, fields)), [fields, freeText, items, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(currentPageIndex, pageCount);
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  return { filtered, visible, page, pageCount, setCurrentPageIndex };
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <Box textAlign="center" color="inherit" padding="l">
      <SpaceBetween size="s">
        <Box variant="strong">{title}</Box>
        <Box variant="p" color="inherit">
          {detail}
        </Box>
      </SpaceBetween>
    </Box>
  );
}

function MetricCards({
  overview,
  aws,
  jobs,
  users,
}: {
  overview: AdminOverview | null;
  aws: AwsOverview | null;
  jobs: ProvisioningJob[];
  users: AdminUser[];
}) {
  const highRiskGroups = aws?.network.security_groups.filter((group) => group.risk_level === "high").length ?? 0;
  const runningInstances = aws?.ec2.lab_instances.filter((instance) => instance.state === "running").length ?? 0;
  const slowJobs = jobs.filter((job) => job.is_slow).length;
  const activeUsers = users.filter((item) => (item.active_labs ?? 0) > 0).length;

  return (
    <ColumnLayout columns={4} variant="text-grid">
      <Container header={<Header variant="h3">Active labs</Header>}>
        <Box variant="awsui-key-label">{overview?.labs.active ?? 0}</Box>
        <Box color="text-body-secondary">{overview?.labs.failed ?? 0} failed, {overview?.labs.queued ?? 0} queued</Box>
      </Container>
      <Container header={<Header variant="h3">Compute running</Header>}>
        <Box variant="awsui-key-label">{runningInstances}</Box>
        <Box color="text-body-secondary">{aws?.ec2.lab_instances.length ?? 0} tagged hosts</Box>
      </Container>
      <Container header={<Header variant="h3">Security exposure</Header>}>
        <Box variant="awsui-key-label">{highRiskGroups}</Box>
        <Box color="text-body-secondary">high-risk groups</Box>
      </Container>
      <Container header={<Header variant="h3">Spend / jobs</Header>}>
        <Box variant="awsui-key-label">{money(aws?.costs.total)}</Box>
        <Box color="text-body-secondary">{slowJobs} slow jobs, {activeUsers} active users</Box>
      </Container>
    </ColumnLayout>
  );
}

function ResourceFilter({
  query,
  onChange,
  count,
  properties,
  options = [],
}: {
  query: PropertyFilterProps.Query;
  onChange: (query: PropertyFilterProps.Query) => void;
  count: number;
  properties: PropertyFilterProps.FilteringProperty[];
  options?: PropertyFilterProps.FilteringOption[];
}) {
  return (
    <PropertyFilter
      query={query}
      onChange={({ detail }) => onChange(detail)}
      filteringProperties={properties}
      filteringOptions={options}
      countText={`${count} match${count === 1 ? "" : "es"}`}
      expandToViewport
      filteringPlaceholder="Filter resources by property or free text"
      i18nStrings={{
        filteringAriaLabel: "Filter resources",
        filteringPlaceholder: "Filter resources",
        clearFiltersText: "Clear filters",
        operationAndText: "and",
        operationOrText: "or",
        operatorContainsText: "contains",
        operatorDoesNotContainText: "does not contain",
        operatorEqualsText: "equals",
        operatorDoesNotEqualText: "does not equal",
        editTokenHeader: "Edit filter",
        propertyText: "Property",
        operatorText: "Operator",
        valueText: "Value",
        cancelActionText: "Cancel",
        applyActionText: "Apply",
        allPropertiesLabel: "All properties",
        tokenLimitShowMore: "Show more",
        tokenLimitShowFewer: "Show fewer",
        clearAriaLabel: "Clear",
        removeTokenButtonAriaLabel: (token) => `Remove token ${token.propertyKey ?? token.value}`,
        enteredTextLabel: (text) => `Use: ${text}`,
      }}
    />
  );
}

function Preferences({
  pageSize,
  setPageSize,
}: {
  pageSize: number;
  setPageSize: (value: number) => void;
}) {
  return (
    <CollectionPreferences
      title="Preferences"
      confirmLabel="Confirm"
      cancelLabel="Cancel"
      preferences={{ pageSize }}
      onConfirm={({ detail }) => setPageSize(detail.pageSize ?? pageSize)}
      pageSizePreference={{
        title: "Page size",
        options: [
          { value: 10, label: "10 resources" },
          { value: 25, label: "25 resources" },
          { value: 50, label: "50 resources" },
        ],
      }}
    />
  );
}

function ResourceTable<T>({
  title,
  description,
  items,
  filteredCount,
  page,
  pageCount,
  setPage,
  pageSize,
  setPageSize,
  loading,
  columnDefinitions,
  trackBy,
  filter,
  actions,
  empty,
}: {
  title: string;
  description: string;
  items: T[];
  filteredCount: number;
  page: number;
  pageCount: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  loading: boolean;
  columnDefinitions: TableProps.ColumnDefinition<T>[];
  trackBy: TableProps.TrackBy<T>;
  filter: React.ReactNode;
  actions?: React.ReactNode;
  empty: React.ReactNode;
}) {
  return (
    <Table
      trackBy={trackBy}
      loading={loading}
      loadingText="Loading resources"
      items={items}
      columnDefinitions={columnDefinitions}
      resizableColumns
      stickyHeader
      empty={empty}
      filter={filter}
      header={
        <Header
          variant="h2"
          counter={`(${filteredCount})`}
          actions={actions}
          description={description}
        >
          {title}
        </Header>
      }
      pagination={<Pagination currentPageIndex={page} pagesCount={pageCount} onChange={({ detail }) => setPage(detail.currentPageIndex)} />}
      preferences={<Preferences pageSize={pageSize} setPageSize={setPageSize} />}
    />
  );
}

function DetailSplitPanel({
  resource,
  labs,
  events,
}: {
  resource: InspectorResource | null;
  labs: AdminLab[];
  events: LabEvent[];
}) {
  if (!resource) {
    return (
      <SplitPanel header="Resource details">
        <Box color="text-body-secondary">Select a resource to inspect metadata, ownership, links, and debug context.</Box>
      </SplitPanel>
    );
  }

  if (resource.type === "EC2 instance") {
    const instance = resource.item;
    const linkedLab = labs.find(
      (lab) =>
        lab.instance_id === instance.lab_instance_id ||
        lab.cfn_stack_name === instance.stack_name ||
        Boolean(instance.public_ip && lab.ec2_public_ip === instance.public_ip)
    );
    return (
      <SplitPanel header={`EC2: ${resource.title}`}>
        <SpaceBetween size="m">
          <KeyValuePairs
            columns={3}
            items={[
              { label: "Instance ID", value: <CopyToClipboard copyButtonText="Copy" copyErrorText="Copy failed" copySuccessText="Copied" textToCopy={instance.id ?? ""} /> },
              { label: "State", value: <Status value={instance.state} /> },
              { label: "Type", value: instance.type ?? "-" },
              { label: "AZ", value: instance.az ?? "-" },
              { label: "Public IP", value: instance.public_ip ?? "-" },
              { label: "Private IP", value: instance.private_ip ?? "-" },
              { label: "Uptime", value: `${instance.uptime_hours ?? 0}h` },
              { label: "Estimated running cost", value: money(instance.estimated_running_cost) },
              { label: "AWS Console", value: <ConsoleLink href={instance.console_url} label="Open instance" /> },
            ]}
          />
          <Container header={<Header variant="h3">Debug ownership</Header>}>
            {linkedLab ? (
              <SpaceBetween size="s">
                <Box>This instance is linked to lab <strong>{linkedLab.template_title}</strong> owned by <strong>{linkedLab.owner_email}</strong>.</Box>
                <Box>Stack: {linkedLab.cfn_stack_name ?? "-"} · status: {linkedLab.status} · expires: {fmt(linkedLab.expires_at)}</Box>
              </SpaceBetween>
            ) : (
              <Alert type="warning">No local lab row matched this host by lab ID, stack name, or public IP. Treat it as a possible orphan until verified.</Alert>
            )}
          </Container>
          <Tabs
            tabs={[
              {
                id: "network",
                label: "Networking",
                content: (
                  <KeyValuePairs
                    columns={2}
                    items={[
                      { label: "VPC", value: instance.vpc_id ?? "-" },
                      { label: "Subnet", value: instance.subnet_id ?? "-" },
                      { label: "Security groups", value: (instance.security_groups ?? []).map((group) => `${group.name} (${group.id})`).join(", ") || "-" },
                      { label: "Volumes", value: (instance.volume_ids ?? []).join(", ") || "-" },
                    ]}
                  />
                ),
              },
              {
                id: "tags",
                label: "Tags",
                content: (
                  <Table
                    trackBy="key"
                    items={Object.entries(instance.tags ?? {}).map(([key, value]) => ({ key, value }))}
                    columnDefinitions={[
                      { id: "key", header: "Key", cell: (item) => item.key },
                      { id: "value", header: "Value", cell: (item) => item.value },
                    ]}
                    empty={<EmptyState title="No tags" detail="This resource did not return tags." />}
                  />
                ),
              },
            ]}
          />
        </SpaceBetween>
      </SplitPanel>
    );
  }

  if (resource.type === "Security group") {
    const group = resource.item;
    return (
      <SplitPanel header={`Security group: ${resource.title}`}>
        <SpaceBetween size="m">
          <KeyValuePairs
            columns={3}
            items={[
              { label: "Group ID", value: <CopyToClipboard copyButtonText="Copy" copyErrorText="Copy failed" copySuccessText="Copied" textToCopy={group.id ?? ""} /> },
              { label: "VPC", value: group.vpc_id ?? "-" },
              { label: "Risk", value: <RiskBadge value={group.risk_level} /> },
              { label: "Attached resources", value: String(group.attached_count ?? 0) },
              { label: "Inbound rules", value: String(group.ingress_rules ?? 0) },
              { label: "Outbound rules", value: String(group.egress_rules ?? 0) },
              { label: "AWS Console", value: <ConsoleLink href={group.console_url} label="Open security group" /> },
            ]}
          />
          <Table
            trackBy={(item) => `${item.direction}-${item.protocol}-${item.ports}-${item.targets.map((target) => target.value).join(",")}`}
            items={group.rules ?? []}
            columnDefinitions={[
              { id: "direction", header: "Direction", cell: (item) => <Badge>{item.direction}</Badge> },
              { id: "protocol", header: "Protocol", cell: (item) => item.protocol },
              { id: "ports", header: "Port/range", cell: (item) => item.ports },
              { id: "targets", header: "Source / destination", cell: (item) => item.targets.map((target) => `${target.type}: ${target.value}`).join(", ") || "-" },
              { id: "risk", header: "Risk", cell: (item) => <RiskBadge value={item.risk} /> },
              { id: "explanation", header: "Explanation", cell: (item) => item.explanation },
            ]}
            header={<Header variant="h3">Rule debugger</Header>}
            empty={<EmptyState title="No rules" detail="This security group did not return ingress or egress rules." />}
          />
          <Table
            trackBy={(item) => item.network_interface_id ?? item.instance_id ?? item.private_ip ?? "attachment"}
            items={group.attachments ?? []}
            columnDefinitions={[
              { id: "eni", header: "Network interface", cell: (item) => item.network_interface_id ?? "-" },
              { id: "instance", header: "Instance", cell: (item) => item.instance_id ?? "-" },
              { id: "private", header: "Private IP", cell: (item) => item.private_ip ?? "-" },
              { id: "status", header: "Status", cell: (item) => <Status value={item.status} /> },
            ]}
            header={<Header variant="h3">Attachments</Header>}
            empty={<Alert type="warning">No attachments found. This group may be unused and safe to review for cleanup.</Alert>}
          />
        </SpaceBetween>
      </SplitPanel>
    );
  }

  if (resource.type === "Lab") {
    const lab = resource.item;
    const labEvents = events.filter((event) => event.instance_id === lab.instance_id).slice(0, 12);
    return (
      <SplitPanel header={`Lab: ${resource.title}`}>
        <SpaceBetween size="m">
          <KeyValuePairs
            columns={3}
            items={[
              { label: "Lab ID", value: <CopyToClipboard copyButtonText="Copy" copyErrorText="Copy failed" copySuccessText="Copied" textToCopy={lab.instance_id} /> },
              { label: "Owner", value: lab.owner_email },
              { label: "Status", value: <Status value={String(lab.status)} /> },
              { label: "Progress", value: `${lab.progress}%` },
              { label: "Retries", value: String(lab.retry_count ?? 0) },
              { label: "Public IP", value: lab.ec2_public_ip ?? "-" },
              { label: "Stack", value: lab.cfn_stack_name ?? "-" },
              { label: "Expires", value: fmt(lab.expires_at) },
              { label: "Estimated cost", value: money(lab.estimated_aws_cost) },
            ]}
          />
          {lab.failure_reason ? <Alert type="error">{lab.failure_reason}</Alert> : <Alert type="info">{lab.status_message}</Alert>}
          <Table
            trackBy="id"
            items={labEvents}
            columnDefinitions={[
              { id: "time", header: "Time", cell: (item) => fmt(item.created_at) },
              { id: "level", header: "Level", cell: (item) => <Status value={item.level} /> },
              { id: "phase", header: "Phase", cell: (item) => item.phase },
              { id: "message", header: "Message", cell: (item) => item.message },
            ]}
            header={<Header variant="h3">Lifecycle events</Header>}
            empty={<EmptyState title="No events" detail="No recent events were returned for this lab." />}
          />
        </SpaceBetween>
      </SplitPanel>
    );
  }

  if (resource.type === "Provisioning job") {
    const job = resource.item;
    return (
      <SplitPanel header={`Job: ${resource.title}`}>
        <SpaceBetween size="m">
          <KeyValuePairs
            columns={3}
            items={[
              { label: "Job ID", value: <CopyToClipboard copyButtonText="Copy" copyErrorText="Copy failed" copySuccessText="Copied" textToCopy={job.id} /> },
              { label: "Lab", value: job.template_title },
              { label: "User", value: job.owner_email },
              { label: "Status", value: <Status value={String(job.status)} /> },
              { label: "Duration", value: `${job.duration_hours}h` },
              { label: "Retries", value: String(job.retries) },
              { label: "Stack", value: job.resource_ids.cloudformation_stack ?? "-" },
              { label: "Cleanup", value: <Status value={job.cleanup_status} /> },
              { label: "Slow", value: job.is_slow ? "yes" : "no" },
            ]}
          />
          {job.error ? <Alert type="error">{job.error}</Alert> : <Alert type="info">{job.current_step}</Alert>}
        </SpaceBetween>
      </SplitPanel>
    );
  }

  if (resource.type === "User") {
    const user = resource.item;
    return (
      <SplitPanel header={`User: ${resource.title}`}>
        <KeyValuePairs
          columns={2}
          items={[
            { label: "User ID", value: <CopyToClipboard copyButtonText="Copy" copyErrorText="Copy failed" copySuccessText="Copied" textToCopy={user.id} /> },
            { label: "Email", value: user.email },
            { label: "Role", value: <Badge>{user.role}</Badge> },
            { label: "Status", value: <Status value={user.is_disabled ? "disabled" : "active"} /> },
            { label: "Credits", value: String(user.credits_balance) },
            { label: "Active labs", value: String(user.active_labs ?? 0) },
            { label: "Total labs", value: String(user.total_labs ?? 0) },
            { label: "Created", value: fmt(user.created_at) },
          ]}
        />
      </SplitPanel>
    );
  }

  const resourceWithConsole = resource.item as { console_url?: string };
  return (
    <SplitPanel header={`${resource.type}: ${resource.title}`}>
      <KeyValuePairs
        columns={2}
        items={[
          { label: "Name", value: resource.title },
          { label: "Identifier", value: resource.subtitle },
          { label: "AWS Console", value: <ConsoleLink href={resourceWithConsole.console_url} /> },
        ]}
      />
    </SplitPanel>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [labs, setLabs] = useState<AdminLab[]>([]);
  const [events, setEvents] = useState<LabEvent[]>([]);
  const [credits, setCredits] = useState<CreditTransaction[]>([]);
  const [jobs, setJobs] = useState<ProvisioningJob[]>([]);
  const [aws, setAws] = useState<AwsOverview | null>(null);
  const [logs, setLogs] = useState("");
  const [logService, setLogService] = useState<"api" | "worker">("worker");
  const [activeSection, setActiveSection] = useState<AdminSection>("overview");
  const [query, setQuery] = useState<PropertyFilterProps.Query>(defaultQuery);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [navigationOpen, setNavigationOpen] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [splitPanelOpen, setSplitPanelOpen] = useState(false);
  const [inspector, setInspector] = useState<InspectorResource | null>(null);
  const [flashItems, setFlashItems] = useState<FlashbarProps.MessageDefinition[]>([]);
  const [confirmLab, setConfirmLab] = useState<AdminLab | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [awsWarning, setAwsWarning] = useState<string | null>(null);
  const [coreError, setCoreError] = useState<string | null>(null);

  const notify = useCallback((type: FlashbarProps.Type, content: string, header?: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setFlashItems((items) => [
      ...items,
      {
        id,
        type,
        header,
        content,
        dismissible: true,
        onDismiss: () => setFlashItems((current) => current.filter((item) => item.id !== id)),
      },
    ]);
  }, []);

  const openInspector = useCallback((resource: InspectorResource) => {
    setInspector(resource);
    setSplitPanelOpen(true);
  }, []);

  const loadLogs = useCallback(async (service: "api" | "worker") => {
    setLogService(service);
    try {
      setLogs(await getAdminAwsLogs(service));
    } catch (error) {
      setLogs(extractApiErrorMessage(error));
    }
  }, []);

  const loadAdmin = useCallback(async () => {
    setLoading(true);
    setCoreError(null);
    setAwsWarning(null);
    try {
      const [nextOverview, nextUsers, nextLabs, nextEvents, nextCredits, nextJobs, nextAws] = await Promise.allSettled([
        getAdminOverview(),
        getAdminUsers(),
        getAdminLabs(),
        getAdminEvents(),
        getAdminCreditTransactions(),
        getAdminProvisioningJobs(),
        getAdminAwsOverview(),
      ]);

      if (nextOverview.status === "fulfilled") setOverview(nextOverview.value);
      if (nextUsers.status === "fulfilled") setUsers(nextUsers.value);
      if (nextLabs.status === "fulfilled") setLabs(nextLabs.value);
      if (nextEvents.status === "fulfilled") setEvents(nextEvents.value);
      if (nextCredits.status === "fulfilled") setCredits(nextCredits.value);
      if (nextJobs.status === "fulfilled") setJobs(nextJobs.value);
      if (nextAws.status === "fulfilled") setAws(nextAws.value);
      else setAwsWarning(extractApiErrorMessage(nextAws.reason));

      const coreFailure = [nextOverview, nextUsers, nextLabs, nextEvents, nextCredits, nextJobs].find((result) => result.status === "rejected");
      if (coreFailure?.status === "rejected") setCoreError(extractApiErrorMessage(coreFailure.reason));
    } catch (error) {
      setCoreError(extractApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadAdmin);
  }, [loadAdmin]);

  useEffect(() => {
    if (activeSection === "logs") void Promise.resolve().then(() => loadLogs(logService));
  }, [activeSection, loadLogs, logService]);

  const resetCollectionState = (section: AdminSection) => {
    setActiveSection(section);
    setQuery(defaultQuery);
  };

  const stopLab = async () => {
    if (!confirmLab) return;
    setActionId(confirmLab.instance_id);
    try {
      await adminStopLab(confirmLab.instance_id);
      notify("success", `Teardown queued for ${confirmLab.template_title}`, "Lab stop requested");
      setConfirmLab(null);
      await loadAdmin();
    } catch (error) {
      notify("error", extractApiErrorMessage(error), "Could not stop lab");
    } finally {
      setActionId(null);
    }
  };

  const extendLab = async (lab: AdminLab, hours: number) => {
    setActionId(lab.instance_id);
    try {
      await adminExtendLabTtl(lab.instance_id, hours);
      notify("success", `${lab.template_title} extended by ${hours}h`, "TTL extended");
      await loadAdmin();
    } catch (error) {
      notify("error", extractApiErrorMessage(error), "TTL extension failed");
    } finally {
      setActionId(null);
    }
  };

  const addCredit = async (row: AdminUser) => {
    setActionId(row.id);
    try {
      await adjustAdminUserCredits(row.id, 5, "Operator credit grant");
      notify("success", `Added 5 credits to ${row.email}`, "Credits updated");
      await loadAdmin();
    } catch (error) {
      notify("error", extractApiErrorMessage(error), "Credit adjustment failed");
    } finally {
      setActionId(null);
    }
  };

  const commonActions = (
    <SpaceBetween direction="horizontal" size="xs">
      <Button iconName="refresh" loading={loading} onClick={loadAdmin}>Refresh</Button>
    </SpaceBetween>
  );

  const instances = aws?.ec2.lab_instances ?? [];
  const ecrImages = [aws?.ecr.api, aws?.ecr.worker].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const instanceFields = useMemo(() => ({
    state: (item: AwsInstance) => item.state,
    type: (item: AwsInstance) => item.type,
    az: (item: AwsInstance) => item.az,
    owner: (item: AwsInstance) => labs.find((lab) => lab.instance_id === item.lab_instance_id || lab.ec2_public_ip === item.public_ip)?.owner_email,
    lab: (item: AwsInstance) => item.lab_instance_id,
  }), [labs]);
  const instanceCollection = usePagedItems(
    instances,
    pageSize,
    query,
    (item) => [item.id, item.name, item.public_ip, item.private_ip, item.lab_instance_id, item.stack_name, item.az, item.state].join(" "),
    instanceFields
  );

  const securityGroups = aws?.network.security_groups ?? [];
  const securityCollection = usePagedItems(
    securityGroups,
    pageSize,
    query,
    (item) => [item.id, item.name, item.description, item.vpc_id, item.risk_level].join(" "),
    {
      risk: (item) => item.risk_level,
      vpc: (item) => item.vpc_id,
      name: (item) => item.name,
      attached: (item) => item.attached_count,
    }
  );

  const labsCollection = usePagedItems(
    labs,
    pageSize,
    query,
    (item) => [item.instance_id, item.template_title, item.owner_email, item.status, item.ec2_public_ip, item.cfn_stack_name].join(" "),
    {
      status: (item) => String(item.status),
      owner: (item) => item.owner_email,
      template: (item) => item.template_title,
    }
  );

  const usersCollection = usePagedItems(
    users,
    pageSize,
    query,
    (item) => [item.id, item.email, item.role, item.subscription_tier].join(" "),
    {
      role: (item) => item.role,
      status: (item) => (item.is_disabled ? "disabled" : "active"),
      email: (item) => item.email,
    }
  );

  const jobsCollection = usePagedItems(
    jobs,
    pageSize,
    query,
    (item) => [item.id, item.template_title, item.owner_email, item.status, item.current_step, item.error, item.cleanup_status].join(" "),
    {
      status: (item) => String(item.status),
      cleanup: (item) => item.cleanup_status,
      slow: (item) => (item.is_slow ? "yes" : "no"),
      owner: (item) => item.owner_email,
    }
  );

  const creditCollection = usePagedItems(
    credits,
    pageSize,
    query,
    (item) => [item.user_id, item.reason, item.delta, item.created_at].join(" "),
    {
      user: (item) => item.user_id,
      reason: (item) => item.reason,
    }
  );

  const computeColumns: TableProps.ColumnDefinition<AwsInstance>[] = [
    {
      id: "name",
      header: "Name",
      cell: (item) => (
        <Link onFollow={(event) => { event.preventDefault(); openInspector({ type: "EC2 instance", title: item.name ?? item.id ?? "Instance", subtitle: item.id ?? "-", item }); }}>
          {item.name ?? item.id}
        </Link>
      ),
      sortingField: "name",
    },
    { id: "id", header: "Instance ID", cell: (item) => <CopyToClipboard copyButtonText="Copy" copyErrorText="Copy failed" copySuccessText="Copied" textToCopy={item.id ?? ""} /> },
    { id: "state", header: "State", cell: (item) => <Status value={item.state} />, sortingField: "state" },
    { id: "type", header: "Type", cell: (item) => item.type ?? "-" },
    { id: "az", header: "Region/AZ", cell: (item) => item.az ?? aws?.region ?? "-" },
    { id: "public", header: "Public IP", cell: (item) => item.public_ip ?? "-" },
    { id: "private", header: "Private IP", cell: (item) => item.private_ip ?? "-" },
    { id: "lab", header: "Linked lab", cell: (item) => compact(item.lab_instance_id) },
    { id: "owner", header: "Owner/user", cell: (item) => labs.find((lab) => lab.instance_id === item.lab_instance_id || lab.ec2_public_ip === item.public_ip)?.owner_email ?? "-" },
    { id: "uptime", header: "Uptime", cell: (item) => `${item.uptime_hours ?? 0}h` },
    { id: "cost", header: "Estimated cost", cell: (item) => money(item.estimated_running_cost) },
    {
      id: "actions",
      header: "Actions",
      cell: (item) => (
        <ButtonDropdown
          variant="inline-icon"
          ariaLabel="Instance actions"
          items={[
            { id: "view", text: "View details" },
            { id: "aws", text: "Open in AWS Console", disabled: !item.console_url },
            { id: "stop", text: "Stop", disabled: true, disabledReason: "TODO: backend EC2 stop action is not implemented" },
            { id: "reboot", text: "Reboot", disabled: true, disabledReason: "TODO: backend EC2 reboot action is not implemented" },
            { id: "terminate", text: "Force terminate", disabled: true, disabledReason: "TODO: guarded terminate endpoint required" },
          ]}
          onItemClick={({ detail }) => {
            if (detail.id === "view") openInspector({ type: "EC2 instance", title: item.name ?? item.id ?? "Instance", subtitle: item.id ?? "-", item });
            if (detail.id === "aws" && item.console_url) window.open(item.console_url, "_blank", "noreferrer");
          }}
        />
      ),
    },
  ];

  const securityColumns: TableProps.ColumnDefinition<AwsSecurityGroup>[] = [
    {
      id: "name",
      header: "Security group",
      cell: (item) => (
        <Link onFollow={(event) => { event.preventDefault(); openInspector({ type: "Security group", title: item.name ?? item.id ?? "Security group", subtitle: item.id ?? "-", item }); }}>
          {item.name ?? item.id}
        </Link>
      ),
    },
    { id: "id", header: "ID", cell: (item) => <CopyToClipboard copyButtonText="Copy" copyErrorText="Copy failed" copySuccessText="Copied" textToCopy={item.id ?? ""} /> },
    { id: "vpc", header: "VPC", cell: (item) => item.vpc_id ?? "-" },
    { id: "attached", header: "Attached resources", cell: (item) => String(item.attached_count ?? 0) },
    { id: "inbound", header: "Inbound", cell: (item) => String(item.ingress_rules ?? 0) },
    { id: "outbound", header: "Outbound", cell: (item) => String(item.egress_rules ?? 0) },
    { id: "risk", header: "Risk level", cell: (item) => <RiskBadge value={item.risk_level} /> },
    { id: "summary", header: "Risk summary", cell: (item) => (item.rules ?? []).filter((rule) => rule.risk !== "low").slice(0, 2).map((rule) => rule.explanation).join(" ") || "No obvious exposure." },
    {
      id: "actions",
      header: "Actions",
      cell: (item) => (
        <ButtonDropdown
          variant="inline-icon"
          ariaLabel="Security group actions"
          items={[
            { id: "view", text: "View details" },
            { id: "aws", text: "Open in AWS Console", disabled: !item.console_url },
            { id: "remediate", text: "Remediate rule", disabled: true, disabledReason: "TODO: guarded rule revoke endpoint required" },
          ]}
          onItemClick={({ detail }) => {
            if (detail.id === "view") openInspector({ type: "Security group", title: item.name ?? item.id ?? "Security group", subtitle: item.id ?? "-", item });
            if (detail.id === "aws" && item.console_url) window.open(item.console_url, "_blank", "noreferrer");
          }}
        />
      ),
    },
  ];

  const labColumns: TableProps.ColumnDefinition<AdminLab>[] = [
    {
      id: "lab",
      header: "Lab name / ID",
      cell: (item) => (
        <Link onFollow={(event) => { event.preventDefault(); openInspector({ type: "Lab", title: item.template_title, subtitle: item.instance_id, item }); }}>
          {item.template_title}
        </Link>
      ),
    },
    { id: "owner", header: "Owner", cell: (item) => item.owner_email },
    { id: "status", header: "Status", cell: (item) => <Status value={String(item.status)} /> },
    { id: "created", header: "Created", cell: (item) => fmt(item.started_at) },
    { id: "uptime", header: "Uptime", cell: (item) => `${item.runtime_hours ?? 0}h` },
    { id: "ttl", header: "TTL / expiration", cell: (item) => fmt(item.expires_at) },
    { id: "ip", header: "Public URL/IP", cell: (item) => item.ec2_public_ip ?? "-" },
    { id: "resources", header: "Resources", cell: (item) => item.cfn_stack_name ?? "-" },
    { id: "credits", header: "Credits", cell: (item) => String(item.credits_cost ?? 0) },
    { id: "cost", header: "Estimated AWS cost", cell: (item) => money(item.estimated_aws_cost) },
    { id: "health", header: "Health", cell: (item) => item.cleanup_required ? <StatusIndicator type="warning">cleanup required</StatusIndicator> : <StatusIndicator type="success">tracked</StatusIndicator> },
    {
      id: "actions",
      header: "Actions",
      cell: (item) => (
        <ButtonDropdown
          variant="inline-icon"
          ariaLabel="Lab actions"
          items={[
            { id: "view", text: "View details" },
            { id: "extend", text: "Extend TTL by 2h" },
            { id: "stop", text: "Force stop" },
            { id: "delete", text: "Force delete", disabled: true, disabledReason: "TODO: hard-delete endpoint required" },
            { id: "restart", text: "Restart", disabled: true, disabledReason: "TODO: restart flow required" },
            { id: "logs", text: "Inspect logs" },
            { id: "cleanup", text: "Cleanup resources", disabled: true, disabledReason: "TODO: orphan cleanup endpoint required" },
          ]}
          onItemClick={({ detail }) => {
            if (detail.id === "view") openInspector({ type: "Lab", title: item.template_title, subtitle: item.instance_id, item });
            if (detail.id === "extend") void extendLab(item, 2);
            if (detail.id === "stop") setConfirmLab(item);
            if (detail.id === "logs") resetCollectionState("logs");
          }}
        />
      ),
    },
  ];

  const userColumns: TableProps.ColumnDefinition<AdminUser>[] = [
    { id: "email", header: "Name/email", cell: (item) => <Link onFollow={(event) => { event.preventDefault(); openInspector({ type: "User", title: item.email, subtitle: item.id, item }); }}>{item.email}</Link> },
    { id: "role", header: "Role", cell: (item) => <Badge>{item.role}</Badge> },
    { id: "status", header: "Status", cell: (item) => <Status value={item.is_disabled ? "disabled" : "active"} /> },
    { id: "credits", header: "Credits", cell: (item) => String(item.credits_balance) },
    { id: "active", header: "Active labs", cell: (item) => String(item.active_labs ?? 0) },
    { id: "total", header: "Total labs launched", cell: (item) => String(item.total_labs ?? 0) },
    { id: "spend", header: "Total estimated spend", cell: (item) => money(labs.filter((lab) => lab.owner_id === item.id).reduce((sum, lab) => sum + (lab.estimated_aws_cost ?? 0), 0)) },
    { id: "activity", header: "Last activity", cell: (item) => fmt(labs.filter((lab) => lab.owner_id === item.id)[0]?.started_at ?? item.created_at) },
    {
      id: "actions",
      header: "Actions",
      cell: (item) => (
        <ButtonDropdown
          variant="inline-icon"
          items={[
            { id: "view", text: "View details" },
            { id: "credit", text: "Add 5 credits" },
            { id: "disable", text: "Disable user", disabled: true, disabledReason: "TODO: user status API is available but UI confirmation is not wired yet" },
          ]}
          onItemClick={({ detail }) => {
            if (detail.id === "view") openInspector({ type: "User", title: item.email, subtitle: item.id, item });
            if (detail.id === "credit") void addCredit(item);
          }}
        />
      ),
    },
  ];

  const jobColumns: TableProps.ColumnDefinition<ProvisioningJob>[] = [
    { id: "id", header: "Job ID", cell: (item) => <Link onFollow={(event) => { event.preventDefault(); openInspector({ type: "Provisioning job", title: item.template_title, subtitle: item.id, item }); }}>{compact(item.id)}</Link> },
    { id: "lab", header: "Lab", cell: (item) => item.template_title },
    { id: "user", header: "User", cell: (item) => item.owner_email },
    { id: "status", header: "Status", cell: (item) => <Status value={String(item.status)} /> },
    { id: "step", header: "Current step", cell: (item) => item.current_step },
    { id: "duration", header: "Duration", cell: (item) => `${item.duration_hours}h` },
    { id: "started", header: "Started", cell: (item) => fmt(item.started_at) },
    { id: "finished", header: "Finished", cell: (item) => fmt(item.finished_at) },
    { id: "retries", header: "Retries", cell: (item) => String(item.retries) },
    { id: "resources", header: "Created resources", cell: (item) => item.resource_ids.cloudformation_stack ?? item.resource_ids.public_ip ?? "-" },
    { id: "error", header: "Error summary", cell: (item) => item.error ?? "-" },
    { id: "cleanup", header: "Cleanup", cell: (item) => <Status value={item.cleanup_status} /> },
  ];

  const navigation = (
    <SideNavigation
      activeHref={`#${activeSection}`}
      header={{ href: "#overview", text: "Orchestrryx Admin" }}
      onFollow={(event) => {
        event.preventDefault();
        const next = event.detail.href.replace("#", "") as AdminSection;
        resetCollectionState(next);
      }}
      items={[
        { type: "link", text: "Overview", href: "#overview" },
        { type: "section", text: "Cloud resources", items: [
          { type: "link", text: "Compute", href: "#compute" },
          { type: "link", text: "Networking", href: "#networking" },
          { type: "link", text: "Security Groups", href: "#security" },
          { type: "link", text: "Storage", href: "#storage" },
        ] },
        { type: "section", text: "Platform", items: [
          { type: "link", text: "Labs", href: "#labs" },
          { type: "link", text: "Users", href: "#users" },
          { type: "link", text: "Credits / Billing", href: "#billing" },
          { type: "link", text: "Provisioning Jobs", href: "#jobs" },
          { type: "link", text: "Logs / Debug", href: "#logs" },
          { type: "link", text: "Settings", href: "#settings" },
        ] },
      ]}
    />
  );

  const breadcrumbs = (
    <BreadcrumbGroup
      items={[
        { text: "Orchestrryx Admin", href: "#overview" },
        { text: sectionLabels[activeSection], href: `#${activeSection}` },
      ]}
      onFollow={(event) => event.preventDefault()}
    />
  );

  const content = (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description="Cloud operations console for AWS resources, labs, provisioning, users, credits, and debugging."
          actions={commonActions}
        >
          {sectionLabels[activeSection]}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Flashbar items={flashItems} />
        {coreError ? <Alert type="error" header="Admin API error">{coreError}</Alert> : null}
        {awsWarning ? <Alert type="warning" header="AWS telemetry warning">{awsWarning}</Alert> : null}

        {activeSection === "overview" ? (
          <SpaceBetween size="l">
            <MetricCards overview={overview} aws={aws} jobs={jobs} users={users} />
            <ColumnLayout columns={2}>
              <Container header={<Header variant="h2">Operator findings</Header>}>
                <SpaceBetween size="s">
                  {(aws?.network.security_groups.filter((group) => group.risk_level === "high").length ?? 0) > 0 ? (
                    <Alert type="error">High-risk security groups expose public or broad access. Open Security Groups to inspect rules.</Alert>
                  ) : <Alert type="success">No high-risk security group rules detected in the current AWS snapshot.</Alert>}
                  {jobs.some((job) => job.is_slow) ? <Alert type="warning">Slow provisioning jobs are present. Open Provisioning Jobs for step and cleanup detail.</Alert> : null}
                  {labs.some((lab) => lab.cleanup_required) ? <Alert type="warning">Some labs need cleanup verification to prevent orphaned spend.</Alert> : null}
                </SpaceBetween>
              </Container>
              <Cards
                cardDefinition={{
                  header: (item) => item.title,
                  sections: [{ id: "detail", content: (item) => item.detail }],
                }}
                cardsPerRow={[{ cards: 1 }, { minWidth: 500, cards: 2 }]}
                items={[
                  { title: "Active labs", detail: `${overview?.labs.active ?? 0} active, ${overview?.labs.failed ?? 0} failed` },
                  { title: "Running compute", detail: `${instances.filter((instance) => instance.state === "running").length} running EC2 lab hosts` },
                  { title: "Estimated spend", detail: `${money(aws?.costs.total)} for ${aws?.costs.period ?? "current period"}` },
                  { title: "Users with active labs", detail: `${users.filter((item) => (item.active_labs ?? 0) > 0).length} users currently consuming lab capacity` },
                ]}
              />
            </ColumnLayout>
          </SpaceBetween>
        ) : null}

        {activeSection === "compute" ? (
          <ResourceTable
            title="EC2 compute resources"
            description="Tagged Orchestrryx lab hosts with ownership, networking, cost, and AWS console links."
            items={instanceCollection.visible}
            filteredCount={instanceCollection.filtered.length}
            page={instanceCollection.page}
            pageCount={instanceCollection.pageCount}
            setPage={instanceCollection.setCurrentPageIndex}
            pageSize={pageSize}
            setPageSize={setPageSize}
            loading={loading}
            columnDefinitions={computeColumns}
            trackBy={(item) => item.id ?? item.name ?? "instance"}
            filter={
              <ResourceFilter
                query={query}
                onChange={setQuery}
                count={instanceCollection.filtered.length}
                properties={[
                  { key: "state", propertyLabel: "State", groupValuesLabel: "State values", operators: [":", "!="] },
                  { key: "type", propertyLabel: "Type", groupValuesLabel: "Type values", operators: [":", "!="] },
                  { key: "az", propertyLabel: "AZ", groupValuesLabel: "AZ values", operators: [":", "!="] },
                  { key: "owner", propertyLabel: "Owner", groupValuesLabel: "Owner values", operators: [":", "!="] },
                  { key: "lab", propertyLabel: "Lab", groupValuesLabel: "Lab values", operators: [":", "!="] },
                ]}
              />
            }
            empty={<EmptyState title="No compute resources" detail="No tagged Orchestrryx EC2 instances were returned." />}
          />
        ) : null}

        {activeSection === "security" ? (
          <ResourceTable
            title="Security group debugger"
            description="Rule-level ingress and egress debugger with risk classification and attachments."
            items={securityCollection.visible}
            filteredCount={securityCollection.filtered.length}
            page={securityCollection.page}
            pageCount={securityCollection.pageCount}
            setPage={securityCollection.setCurrentPageIndex}
            pageSize={pageSize}
            setPageSize={setPageSize}
            loading={loading}
            columnDefinitions={securityColumns}
            trackBy={(item) => item.id ?? item.name ?? "security-group"}
            filter={
              <ResourceFilter
                query={query}
                onChange={setQuery}
                count={securityCollection.filtered.length}
                properties={[
                  { key: "risk", propertyLabel: "Risk", groupValuesLabel: "Risk values", operators: [":", "!="] },
                  { key: "vpc", propertyLabel: "VPC", groupValuesLabel: "VPC values", operators: [":", "!="] },
                  { key: "name", propertyLabel: "Name", groupValuesLabel: "Name values", operators: [":", "!="] },
                  { key: "attached", propertyLabel: "Attached count", groupValuesLabel: "Attached values", operators: [":", "!="] },
                ]}
              />
            }
            empty={<EmptyState title="No security groups" detail="No relevant Orchestrryx security groups were returned. Check AWS_VPC_ID and EC2 permissions." />}
          />
        ) : null}

        {activeSection === "networking" ? (
          <SpaceBetween size="l">
            <ColumnLayout columns={3}>
              {(aws?.network.vpcs ?? []).map((vpc) => (
                <Container key={vpc.id} header={<Header variant="h3">{vpc.id}</Header>}>
                  <KeyValuePairs items={[
                    { label: "CIDR", value: vpc.cidr ?? "-" },
                    { label: "State", value: <Status value={vpc.state} /> },
                    { label: "Default", value: vpc.is_default ? "yes" : "no" },
                    { label: "AWS Console", value: <ConsoleLink href={vpc.console_url} label="Open VPC" /> },
                  ]} />
                </Container>
              ))}
            </ColumnLayout>
            <Table
              trackBy={(item) => item.id ?? "subnet"}
              header={<Header variant="h2">Subnets</Header>}
              items={aws?.network.subnets ?? []}
              columnDefinitions={[
                { id: "id", header: "Subnet ID", cell: (item) => <ConsoleLink href={item.console_url} label={item.id ?? "Subnet"} /> },
                { id: "vpc", header: "VPC", cell: (item) => item.vpc_id },
                { id: "az", header: "AZ", cell: (item) => item.az },
                { id: "cidr", header: "CIDR", cell: (item) => item.cidr },
                { id: "ips", header: "Available IPs", cell: (item) => item.available_ips },
                { id: "public", header: "Public IP on launch", cell: (item) => item.public_ip_on_launch ? "yes" : "no" },
              ]}
              empty={<EmptyState title="No subnets" detail="No VPC subnets were returned." />}
            />
            <ColumnLayout columns={2}>
              <Table
                trackBy={(item) => item.arn ?? item.name ?? "lb"}
                header={<Header variant="h2">Load balancers</Header>}
                items={aws?.load_balancing.load_balancers ?? []}
                columnDefinitions={[
                  { id: "name", header: "Name", cell: (item) => <Link onFollow={(event) => { event.preventDefault(); openInspector({ type: "Load balancer", title: item.name ?? "Load balancer", subtitle: item.arn ?? "-", item }); }}>{item.name}</Link> },
                  { id: "state", header: "State", cell: (item) => <Status value={item.state} /> },
                  { id: "scheme", header: "Scheme", cell: (item) => item.scheme },
                  { id: "console", header: "AWS Console", cell: (item) => <ConsoleLink href={item.console_url} label="Open" /> },
                ]}
              />
              <Table
                trackBy={(item) => item.arn ?? item.name ?? "tg"}
                header={<Header variant="h2">Target groups</Header>}
                items={aws?.load_balancing.target_groups ?? []}
                columnDefinitions={[
                  { id: "name", header: "Name", cell: (item) => <Link onFollow={(event) => { event.preventDefault(); openInspector({ type: "Target group", title: item.name ?? "Target group", subtitle: item.arn ?? "-", item }); }}>{item.name}</Link> },
                  { id: "port", header: "Protocol / port", cell: (item) => `${item.protocol}:${item.port}` },
                  { id: "type", header: "Target type", cell: (item) => item.target_type },
                  { id: "console", header: "AWS Console", cell: (item) => <ConsoleLink href={item.console_url} label="Open" /> },
                ]}
              />
            </ColumnLayout>
          </SpaceBetween>
        ) : null}

        {activeSection === "storage" ? (
          <SpaceBetween size="l">
            <Table
              trackBy={(item) => item.repository}
              header={<Header variant="h2">ECR images</Header>}
              items={ecrImages}
              columnDefinitions={[
                { id: "repository", header: "Repository", cell: (item) => <ConsoleLink href={item?.console_url} label={item?.repository ?? "Repository"} /> },
                { id: "status", header: "Status", cell: (item) => <Status value={item?.status} /> },
                { id: "pushed", header: "Pushed", cell: (item) => fmt(item?.pushed_at) },
                { id: "size", header: "Size", cell: (item) => `${item?.size_mb ?? 0} MB` },
                { id: "tags", header: "Tags", cell: (item) => item?.tags?.join(", ") ?? "-" },
              ]}
            />
            <Table
              trackBy={(item) => item.name ?? "secret"}
              header={<Header variant="h2">Secrets Manager</Header>}
              items={aws?.secrets.items ?? []}
              columnDefinitions={[
                { id: "name", header: "Name", cell: (item) => <ConsoleLink href={item.console_url} label={item.name ?? "Secret"} /> },
                { id: "changed", header: "Last changed", cell: (item) => fmt(item.last_changed_at) },
                { id: "accessed", header: "Last accessed", cell: (item) => fmt(item.last_accessed_at) },
                { id: "rotation", header: "Rotation", cell: (item) => item.rotation_enabled ? <StatusIndicator type="success">enabled</StatusIndicator> : <StatusIndicator type="warning">disabled</StatusIndicator> },
              ]}
            />
          </SpaceBetween>
        ) : null}

        {activeSection === "labs" ? (
          <ResourceTable
            title="Labs"
            description="Lab sessions with owner, lifecycle, TTL, cost, health, and admin intervention actions."
            items={labsCollection.visible}
            filteredCount={labsCollection.filtered.length}
            page={labsCollection.page}
            pageCount={labsCollection.pageCount}
            setPage={labsCollection.setCurrentPageIndex}
            pageSize={pageSize}
            setPageSize={setPageSize}
            loading={loading}
            columnDefinitions={labColumns}
            trackBy="instance_id"
            filter={<ResourceFilter query={query} onChange={setQuery} count={labsCollection.filtered.length} properties={[
              { key: "status", propertyLabel: "Status", groupValuesLabel: "Status values", operators: [":", "!="] },
              { key: "owner", propertyLabel: "Owner", groupValuesLabel: "Owner values", operators: [":", "!="] },
              { key: "template", propertyLabel: "Template", groupValuesLabel: "Template values", operators: [":", "!="] },
            ]} />}
            empty={<EmptyState title="No labs" detail="No lab sessions matched the current filter." />}
          />
        ) : null}

        {activeSection === "users" ? (
          <ResourceTable
            title="Users"
            description="Users, roles, credits, active labs, launch history, and usage cost."
            items={usersCollection.visible}
            filteredCount={usersCollection.filtered.length}
            page={usersCollection.page}
            pageCount={usersCollection.pageCount}
            setPage={usersCollection.setCurrentPageIndex}
            pageSize={pageSize}
            setPageSize={setPageSize}
            loading={loading}
            columnDefinitions={userColumns}
            trackBy="id"
            filter={<ResourceFilter query={query} onChange={setQuery} count={usersCollection.filtered.length} properties={[
              { key: "role", propertyLabel: "Role", groupValuesLabel: "Role values", operators: [":", "!="] },
              { key: "status", propertyLabel: "Status", groupValuesLabel: "Status values", operators: [":", "!="] },
              { key: "email", propertyLabel: "Email", groupValuesLabel: "Email values", operators: [":", "!="] },
            ]} />}
            empty={<EmptyState title="No users" detail="No users matched the current filter." />}
          />
        ) : null}

        {activeSection === "billing" ? (
          <SpaceBetween size="l">
            <ColumnLayout columns={3}>
              <Container header={<Header variant="h3">Cost Explorer</Header>}>{money(aws?.costs.total)} · {aws?.costs.period ?? "unavailable"}</Container>
              <Container header={<Header variant="h3">Running EC2 estimate</Header>}>{money(instances.reduce((sum, item) => sum + (item.estimated_running_cost ?? 0), 0))}</Container>
              <Container header={<Header variant="h3">Outstanding credits</Header>}>{overview?.credits.outstanding_balance.toFixed(1) ?? "0"}</Container>
            </ColumnLayout>
            <ColumnLayout columns={2}>
              <Table
                trackBy="service"
                header={<Header variant="h2">Spend per AWS service</Header>}
                items={aws?.costs.services ?? []}
                columnDefinitions={[
                  { id: "service", header: "Service", cell: (item) => item.service },
                  { id: "amount", header: "Amount", cell: (item) => money(item.amount) },
                ]}
              />
              <Table
                trackBy="instance_id"
                header={<Header variant="h2">Spend per lab</Header>}
                items={labs}
                columnDefinitions={[
                  { id: "lab", header: "Lab", cell: (item) => item.template_title },
                  { id: "owner", header: "Owner", cell: (item) => item.owner_email },
                  { id: "cost", header: "Estimated cost", cell: (item) => money(item.estimated_aws_cost) },
                ]}
              />
            </ColumnLayout>
            <ResourceTable
              title="Credit transactions"
              description="Append-only credit ledger."
              items={creditCollection.visible}
              filteredCount={creditCollection.filtered.length}
              page={creditCollection.page}
              pageCount={creditCollection.pageCount}
              setPage={creditCollection.setCurrentPageIndex}
              pageSize={pageSize}
              setPageSize={setPageSize}
              loading={loading}
              columnDefinitions={[
                { id: "delta", header: "Delta", cell: (item) => item.delta >= 0 ? `+${item.delta}` : item.delta },
                { id: "user", header: "User ID", cell: (item) => compact(item.user_id) },
                { id: "reason", header: "Reason", cell: (item) => item.reason },
                { id: "created", header: "Created", cell: (item) => fmt(item.created_at) },
              ]}
              trackBy="id"
              filter={<ResourceFilter query={query} onChange={setQuery} count={creditCollection.filtered.length} properties={[
                { key: "user", propertyLabel: "User", groupValuesLabel: "User values", operators: [":", "!="] },
                { key: "reason", propertyLabel: "Reason", groupValuesLabel: "Reason values", operators: [":", "!="] },
              ]} />}
              empty={<EmptyState title="No credit transactions" detail="No credit ledger entries matched the current filter." />}
            />
          </SpaceBetween>
        ) : null}

        {activeSection === "jobs" ? (
          <ResourceTable
            title="Provisioning jobs"
            description="Lifecycle jobs with current step, duration, resources, retries, errors, and cleanup status."
            items={jobsCollection.visible}
            filteredCount={jobsCollection.filtered.length}
            page={jobsCollection.page}
            pageCount={jobsCollection.pageCount}
            setPage={jobsCollection.setCurrentPageIndex}
            pageSize={pageSize}
            setPageSize={setPageSize}
            loading={loading}
            columnDefinitions={jobColumns}
            trackBy="id"
            filter={<ResourceFilter query={query} onChange={setQuery} count={jobsCollection.filtered.length} properties={[
              { key: "status", propertyLabel: "Status", groupValuesLabel: "Status values", operators: [":", "!="] },
              { key: "cleanup", propertyLabel: "Cleanup", groupValuesLabel: "Cleanup values", operators: [":", "!="] },
              { key: "slow", propertyLabel: "Slow", groupValuesLabel: "Slow values", operators: [":", "!="] },
              { key: "owner", propertyLabel: "Owner", groupValuesLabel: "Owner values", operators: [":", "!="] },
            ]} />}
            empty={<EmptyState title="No jobs" detail="No provisioning jobs matched the current filter." />}
          />
        ) : null}

        {activeSection === "logs" ? (
          <SpaceBetween size="m">
            <Container
              header={
                <Header
                  variant="h2"
                  actions={
                    <SpaceBetween direction="horizontal" size="xs">
                      <Select
                        selectedOption={{ label: logService, value: logService }}
                        onChange={({ detail }) => loadLogs((detail.selectedOption.value as "api" | "worker") ?? "worker")}
                        options={[{ label: "api", value: "api" }, { label: "worker", value: "worker" }]}
                      />
                      <CopyToClipboard copyButtonText="Copy log tail" copyErrorText="Copy failed" copySuccessText="Copied" textToCopy={logs} />
                      <ConsoleLink href={logService === "api" ? aws?.logs.api.console_url : aws?.logs.worker.console_url} label="Open CloudWatch" />
                    </SpaceBetween>
                  }
                >
                  CloudWatch log tail
                </Header>
              }
            >
              <FormField label="Readable log output" description="Filter-by-lab/user/resource is TODO until the backend exposes structured log search.">
                <Textarea value={logs || "Select a service to load logs."} readOnly rows={24} />
              </FormField>
            </Container>
          </SpaceBetween>
        ) : null}

        {activeSection === "settings" ? (
          <ColumnLayout columns={2}>
            <Container header={<Header variant="h2">Telemetry inputs</Header>}>
              <KeyValuePairs items={[
                { label: "Environment", value: process.env.NODE_ENV ?? "development" },
                { label: "API URL", value: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000" },
                { label: "AWS region", value: aws?.region ?? "unavailable" },
                { label: "ECS cluster", value: aws?.cluster ?? "unavailable" },
                { label: "API log group", value: aws?.logs.api.name ?? "unavailable" },
                { label: "Worker log group", value: aws?.logs.worker.name ?? "unavailable" },
              ]} />
            </Container>
            <Container header={<Header variant="h2">Implemented actions</Header>}>
              <SpaceBetween size="s">
                <StatusIndicator type="success">Lab stop queues real backend teardown.</StatusIndicator>
                <StatusIndicator type="success">TTL extension writes real lab event/state.</StatusIndicator>
                <StatusIndicator type="success">Credit grants write the credit ledger.</StatusIndicator>
                <StatusIndicator type="warning">EC2 reboot/terminate and SG remediation are TODO pending guarded backend endpoints.</StatusIndicator>
              </SpaceBetween>
            </Container>
          </ColumnLayout>
        ) : null}
      </SpaceBetween>
    </ContentLayout>
  );

  if (user?.role !== "admin") {
    return (
      <Box padding="xxl">
        <Alert type="error" header="Admin access required">
          Your account is authenticated but is not marked as an Orchestrryx administrator.
        </Alert>
      </Box>
    );
  }

  return (
    <>
      <TopNavigation
        identity={{ href: "/admin", title: "Orchestrryx Admin" }}
        utilities={[
          { type: "button", text: process.env.NODE_ENV ?? "development", iconName: "settings" },
          {
            type: "menu-dropdown",
            text: user?.email ?? "Admin",
            description: user?.role ?? "admin",
            iconName: "user-profile",
            items: [
              { id: "account", text: "Account" },
              { id: "logout", text: "Logout" },
            ],
            onItemClick: ({ detail }) => {
              if (detail.id === "logout") {
                logout();
                router.replace("/login");
              }
              if (detail.id === "account") router.push("/account");
            },
          },
        ]}
      />
      <AppLayout
        contentType="table"
        navigation={navigation}
        navigationOpen={navigationOpen}
        onNavigationChange={({ detail }) => setNavigationOpen(detail.open)}
        breadcrumbs={breadcrumbs}
        content={loading && !overview ? <Box padding="xxl"><Spinner size="large" /> Loading admin console</Box> : content}
        toolsOpen={toolsOpen}
        onToolsChange={({ detail }) => setToolsOpen(detail.open)}
        tools={
          <HelpPanel header={<Header variant="h2">Admin console help</Header>}>
            <SpaceBetween size="s">
              <Box>Use resource tables with property filters to narrow AWS resources, labs, users, jobs, and credit ledger entries.</Box>
              <Box>Open the split panel from any resource row to inspect metadata, ownership, links, and debug details without losing table context.</Box>
              <Box>Destructive or costly actions require confirmations or are left as TODO until protected backend endpoints exist.</Box>
            </SpaceBetween>
          </HelpPanel>
        }
        splitPanel={<DetailSplitPanel resource={inspector} labs={labs} events={events} />}
        splitPanelOpen={splitPanelOpen}
        onSplitPanelToggle={({ detail }) => setSplitPanelOpen(detail.open)}
        splitPanelPreferences={{ position: "side" }}
        notifications={<Flashbar items={flashItems} />}
      />
      <Modal
        visible={Boolean(confirmLab)}
        onDismiss={() => setConfirmLab(null)}
        header="Force stop lab?"
        closeAriaLabel="Close modal"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setConfirmLab(null)}>Cancel</Button>
              <Button variant="primary" loading={Boolean(actionId)} onClick={stopLab}>Queue teardown</Button>
            </SpaceBetween>
          </Box>
        }
      >
        {confirmLab ? (
          <SpaceBetween size="s">
            <Alert type="warning">This marks the lab as destroying and queues the worker teardown flow.</Alert>
            <KeyValuePairs items={[
              { label: "Lab", value: confirmLab.template_title },
              { label: "Instance ID", value: confirmLab.instance_id },
              { label: "Owner", value: confirmLab.owner_email },
              { label: "Current status", value: <Status value={String(confirmLab.status)} /> },
            ]} />
          </SpaceBetween>
        ) : null}
      </Modal>
    </>
  );
}
