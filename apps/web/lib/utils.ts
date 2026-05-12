import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { NormalizedLabStatus } from "@/lib/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function getTimeRemaining(expiresAt: string): string {
  const deltaMs = new Date(expiresAt).getTime() - Date.now();

  if (deltaMs <= 0) {
    return "Expired";
  }

  const totalMinutes = Math.ceil(deltaMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

export function getDifficultyTone(difficulty: string): "green" | "amber" | "red" | "neutral" {
  const normalized = difficulty.toLowerCase();

  if (normalized.includes("easy")) return "green";
  if (normalized.includes("medium")) return "amber";
  if (normalized.includes("hard")) return "red";

  return "neutral";
}

export function normalizeLabStatus(status: string): NormalizedLabStatus {
  const normalized = status.toUpperCase();

  if (
    normalized === "QUEUED" ||
    normalized === "PROVISIONING" ||
    normalized === "STARTING" ||
    normalized === "READY" ||
    normalized === "DESTROYING" ||
    normalized === "STOPPED" ||
    normalized === "EXPIRED" ||
    normalized === "FAILED"
  ) {
    return normalized;
  }

  if (normalized === "RUNNING") return "READY";
  if (normalized === "DESTROYED") return "STOPPED";

  return "FAILED";
}

export function getProvisioningStage(status: string, progress: number): string {
  const normalized = normalizeLabStatus(status);
  if (normalized === "QUEUED") return "Queued";
  if (normalized === "PROVISIONING") return progress >= 35 ? "Creating AWS resources" : "Preparing worker";
  if (normalized === "STARTING") return "Starting services";
  if (normalized === "READY") return "Ready";
  if (normalized === "DESTROYING") return "Stopping";
  if (normalized === "STOPPED") return "Stopped";
  if (normalized === "EXPIRED") return "Expired";
  return "Failed";
}

export function isLabStatusTransitional(status: string): boolean {
  return ["QUEUED", "PROVISIONING", "STARTING", "DESTROYING"].includes(normalizeLabStatus(status));
}

export function isLabStatusTerminal(status: string): boolean {
  return ["FAILED", "STOPPED", "EXPIRED"].includes(normalizeLabStatus(status));
}

export function getVpnConfigFilename(instanceId: string): string {
  const shortId = instanceId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "lab";
  return `orchestryx-${shortId.toLowerCase()}.conf`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
