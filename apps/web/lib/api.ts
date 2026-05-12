import axios, { type InternalAxiosRequestConfig } from "axios";
import type {
  ActiveLab,
  AdminLab,
  AdminOverview,
  AdminUser,
  AuthTokens,
  AwsOverview,
  ConfirmPayload,
  CreditTransaction,
  EmailPasswordPayload,
  LabEvent,
  LabStatusResponse,
  LabTemplate,
  ProvisioningJob,
  CustomLabTopology,
  RefreshPayload,
  StartLabResponse,
  StopLabResponse,
  SubmitFlagResponse,
  UserProfile,
} from "@/lib/types";

// Function reference used by the interceptor to read the current in-memory access token.
let getAccessToken: (() => string | null) | null = null;
let currentAccessToken: string | null = null;

// Axios instance for all backend requests.
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  timeout: 20000,
  headers: {
    "Content-Type": "application/json",
  },
});

const ADMIN_AWS_TIMEOUT_MS = 60000;

// Allows AuthContext to provide the latest token reader to the API layer.
export const setAccessTokenGetter = (
  getter: (() => string | null) | null
): void => {
  getAccessToken = getter;
};

export const setAccessToken = (token: string | null): void => {
  currentAccessToken = token;
};

// Attaches the latest in-memory bearer token to each request automatically.
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = currentAccessToken ?? getAccessToken?.() ?? null;

  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export const extractApiErrorMessage = (error: unknown): string => {
  if (!axios.isAxiosError(error)) {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }
    return "Unexpected error. Please try again.";
  }

  const responseData = error.response?.data;

  if (typeof responseData === "string" && responseData.trim()) {
    return responseData;
  }

  if (responseData && typeof responseData === "object") {
    const detail = Reflect.get(responseData, "detail");
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }

    const message = Reflect.get(responseData, "message");
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  if (error.response?.status === 401) {
    return "Authentication failed. Please verify your credentials.";
  }

  if (error.response?.status === 403) {
    return "Access denied for this operation.";
  }

  if (error.code === "ECONNABORTED") {
    const timeoutSeconds = Math.round(Number(error.config?.timeout ?? api.defaults.timeout ?? 0) / 1000);
    const path = error.config?.url ?? "request";
    return `Request timed out after ${timeoutSeconds || 20}s while calling ${path}. The backend may still be healthy; retry or check the service logs.`;
  }

  if (error.code === "ERR_NETWORK") {
    const baseUrl = String(error.config?.baseURL ?? api.defaults.baseURL ?? "the configured API URL");
    return `Browser could not reach the backend at ${baseUrl}. Confirm Docker Compose is running, the frontend was restarted after env changes, and you are opening the app from the same machine or using the host LAN API URL.`;
  }

  return "Request failed. Please try again.";
};

export async function registerUser(payload: EmailPasswordPayload): Promise<void> {
  await api.post("/auth/register", payload);
}

export async function loginUser(payload: EmailPasswordPayload): Promise<AuthTokens> {
  const response = await api.post<AuthTokens>("/auth/login", payload);
  return response.data;
}

export async function confirmUser(payload: ConfirmPayload): Promise<void> {
  await api.post("/auth/confirm", payload);
}

export async function refreshTokens(payload: RefreshPayload): Promise<AuthTokens> {
  const response = await api.post<AuthTokens>("/auth/refresh", payload);
  return response.data;
}

export async function getCurrentUser(): Promise<UserProfile> {
  const response = await api.get<UserProfile>("/me");
  return response.data;
}

export async function getCatalog(): Promise<LabTemplate[]> {
  const response = await api.get<LabTemplate[]>("/catalog");
  return response.data;
}

export async function getTemplate(templateId: string): Promise<LabTemplate> {
  const response = await api.get<LabTemplate>(`/catalog/${templateId}`);
  return response.data;
}

export async function getActiveLabs(): Promise<ActiveLab[]> {
  const response = await api.get<ActiveLab[]>("/labs/active");
  return response.data;
}

export async function startLab(templateId: string): Promise<StartLabResponse> {
  const response = await api.post<StartLabResponse>("/labs/start", {
    template_id: templateId,
  });
  return response.data;
}

export async function startCustomLab(
  topology: CustomLabTopology
): Promise<StartLabResponse> {
  const response = await api.post<StartLabResponse>("/labs/start", {
    custom_topology: topology,
  });
  return response.data;
}

export async function getLabStatus(instanceId: string): Promise<LabStatusResponse> {
  const response = await api.get<LabStatusResponse>(`/labs/${instanceId}/status`);
  return response.data;
}

export async function getLabEvents(instanceId: string): Promise<LabEvent[]> {
  const response = await api.get<LabEvent[]>(`/labs/${instanceId}/events`);
  return response.data;
}

export async function stopLab(instanceId: string): Promise<StopLabResponse> {
  const response = await api.delete<StopLabResponse>(`/labs/${instanceId}`);
  return response.data;
}

export async function getLabConfig(instanceId: string): Promise<Blob> {
  const response = await api.get<Blob>(`/labs/${instanceId}/config`, {
    responseType: "blob",
  });
  return response.data;
}

function filenameFromContentDisposition(header: string | undefined): string | null {
  if (!header) return null;

  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1].replace(/^"|"$/g, ""));
  }

  const match = header.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? null;
}

async function blobErrorMessage(error: unknown): Promise<string> {
  if (!axios.isAxiosError(error) || !(error.response?.data instanceof Blob)) {
    return extractApiErrorMessage(error);
  }

  const text = await error.response.data.text();
  if (!text.trim()) {
    return extractApiErrorMessage(error);
  }

  try {
    const parsed = JSON.parse(text) as { detail?: unknown; message?: unknown };
    if (typeof parsed.detail === "string" && parsed.detail.trim()) return parsed.detail;
    if (typeof parsed.message === "string" && parsed.message.trim()) return parsed.message;
  } catch {
    // Plain text response body.
  }

  return text;
}

export async function getLabConfigDownload(instanceId: string): Promise<{ blob: Blob; filename: string }> {
  try {
    const response = await api.get<Blob>(`/labs/${instanceId}/config`, {
      responseType: "blob",
      headers: { Accept: "text/plain, application/octet-stream" },
    });
    return {
      blob: response.data,
      filename:
        filenameFromContentDisposition(response.headers["content-disposition"]) ??
        `orchestryx-${instanceId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toLowerCase() || "lab"}.conf`,
    };
  } catch (error) {
    throw new Error(await blobErrorMessage(error));
  }
}

export async function submitLabFlag(
  instanceId: string,
  flag: string
): Promise<SubmitFlagResponse> {
  // Sends the student's recovered flag to the backend for hash-based
  // validation. The UI never decides correctness locally.
  const response = await api.post<SubmitFlagResponse>(`/labs/${instanceId}/flag`, {
    flag,
  });
  return response.data;
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const response = await api.get<AdminOverview>("/admin/overview");
  return response.data;
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const response = await api.get<AdminUser[]>("/admin/users");
  return response.data;
}

export async function adjustAdminUserCredits(
  userId: string,
  delta: number,
  reason: string
): Promise<{ user_id: string; credits_balance: number }> {
  const response = await api.post<{ user_id: string; credits_balance: number }>(
    `/admin/users/${userId}/credits`,
    { delta, reason }
  );
  return response.data;
}

export async function getAdminLabs(): Promise<AdminLab[]> {
  const response = await api.get<AdminLab[]>("/admin/labs");
  return response.data;
}

export async function adminStopLab(instanceId: string): Promise<StopLabResponse> {
  const response = await api.post<StopLabResponse>(`/admin/labs/${instanceId}/stop`);
  return response.data;
}

export async function adminExtendLabTtl(
  instanceId: string,
  hours: number
): Promise<{ instance_id: string; expires_at: string }> {
  const response = await api.post<{ instance_id: string; expires_at: string }>(
    `/admin/labs/${instanceId}/extend-ttl`,
    { hours }
  );
  return response.data;
}

export async function getAdminProvisioningJobs(): Promise<ProvisioningJob[]> {
  const response = await api.get<ProvisioningJob[]>("/admin/provisioning/jobs");
  return response.data;
}

export async function getAdminEvents(): Promise<LabEvent[]> {
  const response = await api.get<LabEvent[]>("/admin/events");
  return response.data;
}

export async function getAdminCreditTransactions(): Promise<CreditTransaction[]> {
  const response = await api.get<CreditTransaction[]>("/admin/credits");
  return response.data;
}

export async function getAdminAwsOverview(): Promise<AwsOverview> {
  const response = await api.get<AwsOverview>("/admin/aws/overview", {
    timeout: ADMIN_AWS_TIMEOUT_MS,
  });
  return response.data;
}

export async function getAdminAwsLogs(service: "api" | "worker"): Promise<string> {
  const response = await api.get<string>(`/admin/aws/logs/${service}`, {
    responseType: "text",
    timeout: ADMIN_AWS_TIMEOUT_MS,
  });
  return response.data;
}
