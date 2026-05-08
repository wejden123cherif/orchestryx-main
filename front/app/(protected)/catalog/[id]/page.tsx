"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Clock3, Cpu, Database, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/useAuth";
import { extractApiErrorMessage, getTemplate, startLab } from "@/lib/api";
import type { LabTemplate } from "@/lib/types";
import { getDifficultyTone } from "@/lib/utils";

function practiceItems(template: LabTemplate): string[] {
  const category = template.category.toLowerCase();

  if (category.includes("web")) {
    return ["Application mapping", "Exploit validation", "Evidence collection"];
  }
  if (category.includes("network")) {
    return ["Service discovery", "Segmentation review", "Lateral movement constraints"];
  }
  if (category.includes("active")) {
    return ["Domain enumeration", "Credential path analysis", "Privilege boundary review"];
  }
  if (category.includes("dfir")) {
    return ["Timeline review", "Artifact triage", "Incident reporting"];
  }
  if (category.includes("malware")) {
    return ["Static review", "Behavior notes", "Containment workflow"];
  }

  return ["Environment orientation", "Hands-on exploitation flow", "Clean teardown workflow"];
}

export default function CatalogDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isAuthReady, tokens } = useAuth();
  const { toast } = useToast();
  const [template, setTemplate] = useState<LabTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadTemplate = useCallback(async () => {
    if (!isAuthReady || !tokens?.access_token) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      setTemplate(await getTemplate(params.id));
    } catch (error) {
      console.error("Failed to load template details", error);
      setErrorMessage(extractApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [isAuthReady, params.id, tokens?.access_token]);

  useEffect(() => {
    if (!isAuthReady || !tokens?.access_token) {
      return;
    }

    void Promise.resolve().then(loadTemplate);
  }, [isAuthReady, loadTemplate, tokens?.access_token]);

  const insufficientCredits = Boolean(
    template && (user?.credits_balance ?? 0) < template.credits_cost
  );

  const items = useMemo(() => (template ? practiceItems(template) : []), [template]);

  const handleStart = async () => {
    if (!template) return;

    setIsStarting(true);
    try {
      const result = await startLab(template.id);
      toast({
        title: "Lab launch requested",
        description: `${result.template} is provisioning.`,
        tone: "success",
      });
      router.push(`/labs/${result.instance_id}`);
    } catch (error) {
      console.error("Failed to start lab from template detail", error);
      toast({
        title: "Unable to start lab",
        description: extractApiErrorMessage(error),
        tone: "error",
      });
    } finally {
      setIsStarting(false);
    }
  };

  if (!isAuthReady || !tokens?.access_token || isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.6fr)_minmax(20rem,0.4fr)]">
        <div className="space-y-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-36 w-full" />
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (errorMessage || !template) {
    return (
      <div className="app-card mx-auto max-w-xl p-8 text-center">
        <h1 className="text-2xl text-foreground">Lab unavailable</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {errorMessage ?? "The requested lab template could not be loaded."}
        </p>
        <Link href="/catalog" className="mt-6 inline-flex items-center gap-2 text-sm text-primary">
          <ArrowLeft className="h-4 w-4" />
          Back to catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.6fr)_minmax(20rem,0.4fr)]">
      <section className="space-y-6">
        <Link href="/catalog" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Catalog
        </Link>

        <div>
          <h1 className="text-4xl text-foreground">{template.title}</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge>{template.category}</Badge>
            <Badge tone={getDifficultyTone(template.difficulty)}>{template.difficulty}</Badge>
          </div>
        </div>

        <div className="app-card p-6">
          <h2 className="text-xl text-foreground">Overview</h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">{template.description}</p>
        </div>

        <div className="app-card p-6">
          <h2 className="text-xl text-foreground">What you will practice</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {items.map((item) => (
              <div key={item} className="rounded-lg border border-border bg-secondary/50 p-3 text-sm text-muted-foreground">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="app-card p-6">
          <h2 className="text-xl text-foreground">Launch lab</h2>
          <div className="mt-5 grid gap-3">
            <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Database className="h-4 w-4 text-primary" />
                Cost
              </span>
              <span className="text-foreground">{template.credits_cost} credits</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Clock3 className="h-4 w-4 text-primary" />
                TTL
              </span>
              <span className="text-foreground">{template.ttl_hours} hours</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Cpu className="h-4 w-4 text-primary" />
                Instance
              </span>
              <span className="mono text-foreground">{template.instance_type}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <WalletCards className="h-4 w-4 text-primary" />
                Balance
              </span>
              <span className="text-foreground">{user?.credits_balance ?? 0} credits</span>
            </div>
          </div>

          {insufficientCredits ? (
            <p className="mt-4 rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-sm text-warning">
              Insufficient credits for this lab.
            </p>
          ) : null}

          <Button
            type="button"
            size="lg"
            className="mt-5 w-full"
            disabled={insufficientCredits || isStarting}
            onClick={handleStart}
          >
            {isStarting ? "Starting..." : "Start Lab"}
          </Button>
        </div>
      </aside>
    </div>
  );
}
