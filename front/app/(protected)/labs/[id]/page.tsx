"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Download, Network, Square } from "lucide-react";
import { StatusBadge } from "@/components/platform/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  extractApiErrorMessage,
  getLabConfig,
  getLabStatus,
  stopLab,
} from "@/lib/api";
import type { LabStatusResponse } from "@/lib/types";
import { cn, formatDateTime, getTimeRemaining, normalizeLabStatus } from "@/lib/utils";

export default function LabDetailPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const [lab, setLab] = useState<LabStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadLab = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      setLab(await getLabStatus(params.id));
    } catch (error) {
      setErrorMessage(extractApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void Promise.resolve().then(loadLab);
  }, [loadLab]);

  const downloadConfig = async () => {
    setIsWorking(true);

    try {
      const config = await getLabConfig(params.id);
      const blob = new Blob([config], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${params.id}.conf`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast({ title: "VPN config downloaded", tone: "success" });
    } catch (error) {
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
      toast({
        title: "Destroy failed",
        description: extractApiErrorMessage(error),
        tone: "error",
      });
    } finally {
      setIsWorking(false);
    }
  };

  if (isLoading) {
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

  if (status === "PROVISIONING") {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-10">
        <Link href="/labs" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          My Labs
        </Link>
        <div className="app-card p-8 text-center">
          <StatusBadge status={lab.status} />
          <h1 className="mt-5 text-3xl text-foreground">Preparing your environment</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Provisioning usually completes in a few minutes. This page can be refreshed safely.
          </p>
          <div className="relative mt-8 h-2 overflow-hidden rounded-full bg-secondary progress-indeterminate" />
          <Button type="button" variant="secondary" className="mt-6" onClick={loadLab}>
            Refresh status
          </Button>
        </div>
      </div>
    );
  }

  if (status === "DESTROYED" || status === "FAILED") {
    return (
      <div className="mx-auto max-w-xl py-10">
        <div className="app-card p-8 text-center">
          <StatusBadge status={lab.status} />
          <h1 className="mt-5 text-3xl text-foreground">
            {status === "FAILED" ? "Lab failed to provision" : "Lab destroyed"}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Start a new lab from the catalog when you are ready.
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
