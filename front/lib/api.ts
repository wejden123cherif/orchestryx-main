import axios, { type InternalAxiosRequestConfig } from "axios";
import type {
  ActiveLab,
  AuthTokens,
  ConfirmPayload,
  EmailPasswordPayload,
  LabStatusResponse,
  LabTemplate,
  RefreshPayload,
  StartLabResponse,
  StopLabResponse,
  UserProfile,
} from "@/lib/types";

// Function reference used by the interceptor to read the current in-memory access token.
let getAccessToken: (() => string | null) | null = null;

// Axios instance for all backend requests.
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  timeout: 20000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Allows AuthContext to provide the latest token reader to the API layer.
export const setAccessTokenGetter = (
  getter: (() => string | null) | null
): void => {
  getAccessToken = getter;
};

// Attaches the latest in-memory bearer token to each request automatically.
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken?.();

  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export const extractApiErrorMessage = (error: unknown): string => {
  if (!axios.isAxiosError(error)) {
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

  if (error.code === "ECONNABORTED" || error.code === "ERR_NETWORK") {
    return "Backend is unreachable. Confirm the API URL is correct.";
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

export async function getLabStatus(instanceId: string): Promise<LabStatusResponse> {
  const response = await api.get<LabStatusResponse>(`/labs/${instanceId}/status`);
  return response.data;
}

export async function stopLab(instanceId: string): Promise<StopLabResponse> {
  const response = await api.delete<StopLabResponse>(`/labs/${instanceId}`);
  return response.data;
}

export async function getLabConfig(instanceId: string): Promise<string> {
  const response = await api.get<string>(`/labs/${instanceId}/config`, {
    responseType: "text",
  });
  return response.data;
}
