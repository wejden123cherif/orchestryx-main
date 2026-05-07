// Shared TypeScript contracts for auth and user data returned by FastAPI.
export interface AuthTokens {
  access_token: string;
  id_token: string;
  refresh_token: string;
  token_type: string;
}

// Request body for login and register endpoints.
export interface EmailPasswordPayload {
  email: string;
  password: string;
}

// Request body for email confirmation endpoint.
export interface ConfirmPayload {
  email: string;
  code: string;
}

// Request body for refresh endpoint.
export interface RefreshPayload {
  refresh_token: string;
}

// Response body from GET /me endpoint.
export interface UserProfile {
  id: string;
  email: string;
  credits_balance: number;
  subscription_tier: string;
  role: "user" | "admin";
  is_disabled: boolean;
  max_active_labs: number | null;
  created_at: string;
}

export interface LabTemplate {
  id: string;
  title: string;
  category: string;
  difficulty: string;
  description: string;
  credits_cost: number;
  ttl_hours: number;
  instance_type: string;
  challenge_port: number;
  challenge_path: string;
}

export type LabStatus =
  | "QUEUED"
  | "PROVISIONING"
  | "STARTING"
  | "READY"
  | "DESTROYING"
  | "STOPPED"
  | "EXPIRED"
  | "FAILED"
  | "RUNNING"
  | "DESTROYED"
  | "queued"
  | "provisioning"
  | "starting"
  | "ready"
  | "destroying"
  | "stopped"
  | "expired"
  | "failed";

export type NormalizedLabStatus =
  | "QUEUED"
  | "PROVISIONING"
  | "STARTING"
  | "READY"
  | "DESTROYING"
  | "STOPPED"
  | "EXPIRED"
  | "FAILED";

export interface ActiveLab {
  instance_id: string;
  template_id: string;
  status: LabStatus;
  progress: number;
  status_message: string;
  failure_reason: string | null;
  ec2_public_ip: string | null;
  challenge_url: string | null;
  expires_at: string;
  started_at: string;
  ready_at: string | null;
  last_status_at: string | null;
  flag_submitted: boolean;
}

export interface StartLabResponse {
  instance_id: string;
  status: LabStatus;
  progress: number;
  status_message: string;
  template: string;
  expires_at: string;
  message: string;
}

export type LabStatusResponse = ActiveLab;

export interface LabEvent {
  id: string;
  instance_id?: string;
  level: "info" | "warning" | "error" | string;
  phase: string;
  message: string;
  progress: number | null;
  created_at: string;
}

export interface StopLabResponse {
  instance_id: string;
  status: string;
  message: string;
}

// Response from POST /labs/{instance_id}/flag. A wrong flag is returned as a
// normal response so the UI can show feedback without entering an error state.
export interface SubmitFlagResponse {
  correct: boolean;
  flag_submitted: boolean;
  message: string;
}

export interface AdminOverview {
  labs: {
    active: number;
    queued: number;
    provisioning: number;
    starting: number;
    ready: number;
    failed: number;
    oldest_queue_age_seconds: number | null;
    all_statuses: Record<string, number>;
  };
  users: { total: number };
  credits: { outstanding_balance: number };
  system: { database: string; stale_queue_warning: boolean };
}

export interface AdminUser {
  id: string;
  email: string;
  role: "user" | "admin";
  is_disabled: boolean;
  credits_balance: number;
  subscription_tier: string;
  max_active_labs: number | null;
  created_at: string;
}

export interface AdminLab {
  instance_id: string;
  template_id: string;
  template_title: string;
  owner_email: string;
  owner_id: string;
  status: LabStatus;
  progress: number;
  status_message: string;
  failure_reason: string | null;
  cfn_stack_name: string | null;
  ec2_public_ip: string | null;
  expires_at: string | null;
  started_at: string;
  ready_at: string | null;
  destroyed_at: string | null;
}

export interface CreditTransaction {
  id: string;
  user_id: string;
  delta: number;
  reason: string;
  created_at: string;
}

export interface AwsOverview {
  region: string;
  cluster: string;
  ecs: {
    api: AwsEcsService;
    worker: AwsEcsService;
    tasks: AwsTask[];
  };
  sqs: {
    provision: AwsQueue;
    destroy: AwsQueue;
  };
  aurora: {
    id: string;
    status: string;
    engine?: string;
    engine_version?: string;
    endpoint?: string;
    reader_endpoint?: string;
    multi_az?: boolean;
    azs?: string[];
    error?: string;
  };
  cognito: {
    id: string;
    name?: string;
    status: string;
    estimated_users?: number;
    mfa?: string;
    created_at?: string;
    error?: string;
  };
  ecr: {
    api: AwsEcrImage;
    worker: AwsEcrImage;
  };
  logs: {
    api: AwsLogGroup;
    worker: AwsLogGroup;
  };
  cloudformation: {
    lab_stacks: AwsStack[];
  };
  ec2: {
    lab_instances: AwsInstance[];
  };
  network: {
    vpcs: AwsVpc[];
    subnets: AwsSubnet[];
    security_groups: AwsSecurityGroup[];
    route_tables: AwsRouteTable[];
    status?: string;
    error?: string;
  };
  load_balancing: {
    load_balancers: AwsLoadBalancer[];
    target_groups: AwsTargetGroup[];
    target_health: AwsTargetHealth[];
    status?: string;
    error?: string;
  };
  autoscaling: {
    groups: AwsAutoScalingGroup[];
    ecs_scaling_targets: AwsEcsScalingTarget[];
    status?: string;
    error?: string;
  };
  secrets: {
    items: AwsSecret[];
    count: number;
    status?: string;
    error?: string;
  };
  iam: {
    roles: AwsIamRole[];
    status?: string;
    error?: string;
  };
  metrics: {
    ecs: Record<string, Record<string, AwsMetricPoint>> & {
      status?: string;
      error?: string;
    };
  };
  alarms: {
    firing: number;
    alarms: AwsAlarm[];
    status?: string;
    error?: string;
  };
  costs: {
    status: string;
    period: string;
    total: number;
    currency: string;
    services: Array<{ service: string; amount: number }>;
    error?: string;
  };
}

export interface AwsEcsService {
  name: string;
  status: string;
  desired?: number;
  running?: number;
  pending?: number;
  task_definition?: string;
  rollout_state?: string | null;
  updated_at?: string | null;
  events?: Array<{ created_at: string | null; message: string }>;
  error?: string;
}

export interface AwsTask {
  id?: string;
  service?: string;
  last_status?: string;
  desired_status?: string;
  cpu?: string;
  memory?: string;
  private_ip?: string | null;
  started_at?: string | null;
  task_definition?: string;
  status?: string;
  error?: string;
}

export interface AwsQueue {
  name: string;
  url?: string;
  queued?: number;
  in_flight?: number;
  oldest_age_seconds?: number;
  status?: string;
  error?: string;
}

export interface AwsEcrImage {
  repository: string;
  status: string;
  pushed_at?: string | null;
  size_mb?: number;
  digest?: string;
  tags?: string[];
  error?: string;
}

export interface AwsLogGroup {
  name: string;
  stored_mb?: number;
  retention_days?: number | null;
  latest_stream?: string | null;
  latest_event_at?: string | null;
  status?: string;
  error?: string;
}

export interface AwsStack {
  name?: string;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
  error?: string;
}

export interface AwsInstance {
  id?: string;
  name?: string;
  lab_instance_id?: string;
  state?: string;
  type?: string;
  public_ip?: string | null;
  private_ip?: string | null;
  az?: string;
  launched_at?: string | null;
  status?: string;
  error?: string;
}

export interface AwsAlarm {
  name?: string;
  state?: string;
  metric?: string;
  namespace?: string;
  reason?: string;
  updated_at?: string | null;
}

export interface AwsVpc {
  id?: string;
  cidr?: string;
  state?: string;
  is_default?: boolean;
}

export interface AwsSubnet {
  id?: string;
  vpc_id?: string;
  az?: string;
  cidr?: string;
  available_ips?: number;
  public_ip_on_launch?: boolean;
}

export interface AwsSecurityGroup {
  id?: string;
  name?: string;
  description?: string;
  vpc_id?: string;
  ingress_rules?: number;
  egress_rules?: number;
}

export interface AwsRouteTable {
  id?: string;
  vpc_id?: string;
  routes?: number;
  associations?: number;
}

export interface AwsLoadBalancer {
  name?: string;
  arn?: string;
  dns_name?: string;
  type?: string;
  scheme?: string;
  state?: string;
  vpc_id?: string;
  azs?: string[];
}

export interface AwsTargetGroup {
  name?: string;
  arn?: string;
  protocol?: string;
  port?: number;
  target_type?: string;
  vpc_id?: string;
  health_check_path?: string;
}

export interface AwsTargetHealth {
  target_group?: string;
  healthy?: number;
  unhealthy?: number;
}

export interface AwsAutoScalingGroup {
  name?: string;
  desired?: number;
  min?: number;
  max?: number;
  instances?: number;
  azs?: string[];
  created_at?: string | null;
}

export interface AwsEcsScalingTarget {
  resource_id?: string;
  dimension?: string;
  min?: number;
  max?: number;
}

export interface AwsSecret {
  name?: string;
  arn?: string;
  last_changed_at?: string | null;
  last_accessed_at?: string | null;
  rotation_enabled?: boolean;
  deleted_at?: string | null;
}

export interface AwsIamRole {
  name?: string;
  arn?: string;
  created_at?: string | null;
  attached_policies?: number;
  max_session_duration?: number;
}

export interface AwsMetricPoint {
  average?: number | null;
  maximum?: number | null;
  timestamp?: string | null;
}

export type CatalogFilter =
  | "All"
  | "Web"
  | "Network"
  | "Active Directory"
  | "DFIR"
  | "Malware";

export type BuilderCategory =
  | "Attacker Machines"
  | "Target Machines"
  | "Network Devices"
  | "Services";

export type BuilderNodeKind = "machine" | "network-device" | "service";

export interface SoftwareConfig {
  name: string;
  version: string;
  cves: string[];
}

export type MachineNodeData = {
  label: string;
  os: string;
  version: string;
  ip: string;
  ports: number[];
  cves: string[];
  isFlag: boolean;
  flagValue: string;
  software: SoftwareConfig[];
  kind: BuilderNodeKind;
  icon: string;
};

export interface BuilderMachineTemplate {
  id: string;
  category: BuilderCategory;
  label: string;
  os: string;
  version: string;
  kind: BuilderNodeKind;
  icon: string;
  ports: number[];
  software: SoftwareConfig[];
}

export type ConnectionProtocol = "TCP" | "UDP" | "ICMP";
export type ConnectionAction = "allow" | "deny";
export type ConnectionDirection = "bidirectional" | "unidirectional";

export interface ConnectionRule {
  protocol: ConnectionProtocol;
  action: ConnectionAction;
  ports: number[];
  direction: ConnectionDirection;
}

export type BuilderEdgeData = {
  label: string;
  rules: ConnectionRule[];
};

export interface CustomLabTopology {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: string;
  estimated_cost_per_hour: number;
  estimated_credits: number;
  machines: Array<{
    id: string;
    position: { x: number; y: number };
    data: MachineNodeData;
  }>;
  connections: Array<{
    id: string;
    source: string;
    target: string;
    data: BuilderEdgeData;
  }>;
}
