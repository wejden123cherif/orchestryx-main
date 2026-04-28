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

export type CatalogFilter =
  | "All"
  | "Web"
  | "Network"
  | "Active Directory"
  | "DFIR"
  | "Malware";
