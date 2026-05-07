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
  | "PROVISIONING"
  | "RUNNING"
  | "DESTROYING"
  | "DESTROYED"
  | "FAILED"
  | "provisioning"
  | "running"
  | "destroying"
  | "destroyed"
  | "failed";

export type NormalizedLabStatus =
  | "PROVISIONING"
  | "RUNNING"
  | "DESTROYING"
  | "DESTROYED"
  | "FAILED";

export interface ActiveLab {
  instance_id: string;
  template_id: string;
  status: LabStatus;
  ec2_public_ip: string | null;
  challenge_url: string | null;
  expires_at: string;
  started_at: string;
}

export interface StartLabResponse {
  instance_id: string;
  status: LabStatus;
  template: string;
  expires_at: string;
  message: string;
}

export interface LabStatusResponse extends ActiveLab {
  flag_submitted: boolean;
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
