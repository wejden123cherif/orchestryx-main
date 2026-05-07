"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, ExternalLink, Flag, Network, Square } from "lucide-react";
import { StatusBadge } from "@/components/platform/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  extractApiErrorMessage,
  getLabConfig,
  getLabEvents,
  getLabStatus,
  stopLab,
  submitLabFlag,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type { LabEvent, LabStatusResponse } from "@/lib/types";
import {
  cn,
  formatDateTime,
  getProvisioningStage,
  getTimeRemaining,
  getVpnConfigFilename,
  normalizeLabStatus,
} from "@/lib/utils";

export default function LabDetailPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const { isAuthReady, tokens } = useAuth();
  const [lab, setLab] = useState<LabStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [flagInput, setFlagInput] = useState("");
  const [isSubmittingFlag, setIsSubmittingFlag] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [events, setEvents] = useState<LabEvent[]>([]);

  const loadLab = useCallback(async () => {
    if (!isAuthReady || !tokens?.access_token) {
      return null;
    }

    setIsLoading(true);

    try {
      const nextLab = await getLabStatus(params.id);
      setLab(nextLab);
      setEvents(await getLabEvents(params.id));
      setErrorMessage(null);
      return nextLab;
    } catch (error) {
      console.error("Failed to load lab status", error);
      setErrorMessage(extractApiErrorMessage(error));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [isAuthReady, params.id, tokens?.access_token]);

  useEffect(() => {
    if (!isAuthReady || !tokens?.access_token) {
      return;
    }

    let isUnmounted = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const pollStatus = async () => {
      if (isUnmounted) {
        return;
      }

      const nextLab = await loadLab();
      if (!nextLab) {
        return;
      }

      const nextStatus = normalizeLabStatus(nextLab.status);
      if (nextStatus === "STOPPED" || nextStatus === "FAILED") {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }
    };

    void Promise.resolve().then(pollStatus);
    intervalId = setInterval(() => {
      void Promise.resolve().then(pollStatus);
    }, 5000);

    return () => {
      isUnmounted = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isAuthReady, loadLab, tokens?.access_token]);

  const downloadConfig = async () => {
    setIsWorking(true);

    try {
      const configBlob = await getLabConfig(params.id);
      const url = window.URL.createObjectURL(new Blob([configBlob]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", getVpnConfigFilename(params.id));
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast({ title: "VPN config downloaded", tone: "success" });
    } catch (error) {
      console.error("Failed to download VPN config", error);
      toast({
        title: "Config unavailable",
        description: extractApiErrorMessage(error),
        tone: "error",
      });
    } finally {
      setIsWorking(false);
    }
  };

  const destroyLab = async () => {
    setIsWorking(true);

    try {
      await stopLab(params.id);
      toast({ title: "Destroy requested", tone: "success" });
      await loadLab();
    } catch (error) {
      console.error("Failed to stop lab", error);
      toast({
        title: "Destroy failed",
        description: extractApiErrorMessage(error),
        tone: "error",
      });
    } finally {
      setIsWorking(false);
    }
  };

  const submitFlag = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Trim the pasted flag before sending it; users often copy a trailing
    // newline from terminal output or a web page.
    const submittedFlag = flagInput.trim();
    if (!submittedFlag) {
      toast({
        title: "Flag required",
        description: "Paste the flag you found in the lab.",
        tone: "error",
      });
      return;
    }

    setIsSubmittingFlag(true);

    try {
      // The backend owns correctness checks because it can compare against
      // hashed template flags and dynamic per-instance flags securely.
      const result = await submitLabFlag(params.id, submittedFlag);

      // Wrong flags are expected during practice, so they show as user
      // feedback instead of throwing the page into an error state.
      if (!result.correct) {
        toast({
          title: "Incorrect flag",
          description: result.message,
          tone: "error",
        });
        return;
      }

      // Refresh status after acceptance so the completion marker updates in
      // the Lab info panel without requiring a manual page refresh.
      toast({
        title: "Flag accepted",
        description: result.message,
        tone: "success",
      });
      setFlagInput("");
      await loadLab();
    } catch (error) {
      console.error("Failed to submit flag", error);
      toast({
        title: "Flag submission failed",
        description: extractApiErrorMessage(error),
        tone: "error",
      });
    } finally {
      setIsSubmittingFlag(false);
    }
  };

  if (!isAuthReady || !tokens?.access_token || isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-96 max-w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (errorMessage || !lab) {
    return (
      <div className="app-card mx-auto max-w-xl p-8 text-center">
        <h1 className="text-2xl text-foreground">Lab unavailable</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {errorMessage ?? "The requested lab status could not be loaded."}
        </p>
        <Link href="/labs" className="mt-6 inline-flex items-center gap-2 text-sm text-primary">
          <ArrowLeft className="h-4 w-4" />
          Back to labs
        </Link>
      </div>
    );
  }

  const status = normalizeLabStatus(lab.status);

  if (status === "QUEUED" || status === "PROVISIONING" || status === "STARTING") {
    const progress = Math.max(0, Math.min(100, lab.progress ?? 0));
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-10">
        <Link href="/labs" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          My Labs
        </Link>
        <div className="app-card p-8 text-center">
          <StatusBadge status={lab.status} />
          <h1 className="mt-5 text-3xl text-foreground">
            {getProvisioningStage(lab.status, progress)}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {lab.status_message || "Provisioning usually completes in a few minutes."}
          </p>
          <div className="mt-8 h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{progress}% complete</p>
          {events.length ? (
            <div className="mt-6 space-y-2 text-left">
              {events.slice(-5).map((event) => (
                <div key={event.id} className="rounded-lg border border-border bg-secondary/50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs uppercase text-muted-foreground">{event.phase}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}</span>
                  </div>
                  <p className="mt-1 text-sm text-foreground">{event.message}</p>
                </div>
              ))}
            </div>
          ) : null}
          <Button type="button" variant="secondary" className="mt-6" onClick={loadLab}>
            Refresh status
          </Button>
        </div>
      </div>
    );
  }

  if (status === "DESTROYING") {
    return (
      <div className="mx-auto max-w-xl py-10">
        <div className="app-card p-8 text-center">
          <StatusBadge status={lab.status} />
          <h1 className="mt-5 text-3xl text-foreground">Destroying lab</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Teardown is in progress. This page updates automatically.
          </p>
        </div>
      </div>
    );
  }

  if (status === "STOPPED" || status === "EXPIRED" || status === "FAILED") {
    return (
      <div className="mx-auto max-w-xl py-10">
        <div className="app-card p-8 text-center">
          <StatusBadge status={lab.status} />
          <h1 className="mt-5 text-3xl text-foreground">
            {status === "FAILED" ? "Lab failed to provision" : status === "EXPIRED" ? "Lab expired" : "Lab stopped"}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {lab.failure_reason ?? "Start a new lab from the catalog when you are ready."}
          </p>
          <Link
            href="/catalog"
            className={cn(buttonVariants.primary, "mt-6 inline-flex h-10 items-center rounded-lg px-4 text-sm")}
          >
            Back to catalog
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/labs" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        My Labs
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <StatusBadge status={lab.status} />
          <h1 className="mono mt-3 text-3xl text-foreground">{lab.instance_id}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Template {lab.template_id} - expires in {getTimeRemaining(lab.expires_at)}
          </p>
        </div>
        <Button type="button" variant="danger" disabled={isWorking} onClick={destroyLab}>
          <Square className="h-4 w-4" />
          Stop lab
        </Button>
      </header>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <div className="app-card p-6">
            <h2 className="text-xl text-foreground">Lab info</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-secondary/50 p-3">
                <p className="text-sm text-muted-foreground">Public IP</p>
                <p className="mono mt-1 text-sm text-foreground">{lab.ec2_public_ip ?? "Pending"}</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/50 p-3">
                <p className="text-sm text-muted-foreground">Challenge URL</p>
                {lab.challenge_url ? (
                  <a
                    href={lab.challenge_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mono mt-1 flex min-w-0 items-center gap-1.5 truncate text-sm text-primary hover:text-[#818cf8]"
                  >
                    <span className="truncate">{lab.challenge_url}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  </a>
                ) : (
                  <p className="mt-1 text-sm text-foreground">Connect VPN first</p>
                )}
              </div>
              <div className="rounded-lg border border-border bg-secondary/50 p-3">
                <p className="text-sm text-muted-foreground">Started</p>
                <p className="mt-1 text-sm text-foreground">{formatDateTime(lab.started_at)}</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/50 p-3">
                <p className="text-sm text-muted-foreground">Expires</p>
                <p className="mt-1 text-sm text-foreground">{formatDateTime(lab.expires_at)}</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/50 p-3">
                <p className="text-sm text-muted-foreground">Flag submitted</p>
                <p className="mt-1 text-sm text-foreground">{lab.flag_submitted ? "Yes" : "No"}</p>
              </div>
            </div>
          </div>

          <div className="app-card p-6">
            <h2 className="text-xl text-foreground">VPN instructions</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Download the generated configuration, import it into WireGuard, and connect before accessing lab resources. Keep the configuration private and destroy the lab when finished.
            </p>
          </div>

          <div className="app-card p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-secondary text-primary">
                {lab.flag_submitted ? <CheckCircle2 className="h-5 w-5" /> : <Flag className="h-5 w-5" />}
              </div>
              <div>
                <h2 className="text-xl text-foreground">Submit flag</h2>
                <p className="text-sm text-muted-foreground">
                  {lab.flag_submitted ? "Challenge completed" : "Paste the flag from the lab environment."}
                </p>
              </div>
            </div>

            {/* Completion is a lab-instance property, so the form locks after
                a correct flag while keeping the lab itself running. */}
            <form className="mt-5 flex flex-col gap-3 sm:flex-row" onSubmit={submitFlag}>
              <input
                value={flagInput}
                onChange={(event) => setFlagInput(event.target.value)}
                disabled={lab.flag_submitted || isSubmittingFlag}
                placeholder="ORCHESTRYX{...}"
                className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
              <Button
                type="submit"
                disabled={lab.flag_submitted || isSubmittingFlag}
                className="sm:w-36"
              >
                <Flag className="h-4 w-4" />
                Submit
              </Button>
            </form>
          </div>
        </div>

        <aside className="app-card p-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-secondary text-primary">
            <Network className="h-5 w-5" />
          </div>
          <h2 className="mt-5 text-xl text-foreground">Connection steps</h2>
          <ol className="mt-5 space-y-3 text-sm text-muted-foreground">
            <li className="rounded-lg border border-border bg-secondary/50 p-3">Download the VPN config.</li>
            <li className="rounded-lg border border-border bg-secondary/50 p-3">Import it into WireGuard.</li>
            <li className="rounded-lg border border-border bg-secondary/50 p-3">Connect and use the assigned lab IPs.</li>
          </ol>
          <Button type="button" className="mt-5 w-full" disabled={isWorking} onClick={downloadConfig}>
            <Download className="h-4 w-4" />
            Download config
          </Button>
        </aside>
      </section>
    </div>
  );
}
