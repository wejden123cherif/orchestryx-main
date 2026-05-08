"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Bug,
  Globe,
  HardDrive,
  Landmark,
  Network,
  PackageSearch,
  Search,
  ShieldAlert,
  Workflow,
} from "lucide-react";
import { EmptyState } from "@/components/platform/empty-state";
import { TemplateCard } from "@/components/platform/template-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { extractApiErrorMessage, getCatalog, startLab } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { seedCatalog } from "@/lib/seed-catalog";
import type { CatalogFilter, LabTemplate } from "@/lib/types";
import { cn } from "@/lib/utils";

const filters: { label: CatalogFilter; icon: typeof Boxes }[] = [
  { label: "All", icon: Boxes },
  { label: "Web App", icon: Globe },
  { label: "CI/CD", icon: Workflow },
  { label: "VulnHub", icon: HardDrive },
  { label: "Active Directory", icon: Landmark },
  { label: "Network", icon: Network },
  { label: "DFIR", icon: PackageSearch },
  { label: "Malware", icon: Bug },
];

function CatalogSkeleton() {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="app-card p-5">
          <div className="flex justify-between">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-16" />
          </div>
          <Skeleton className="mt-6 h-6 w-3/4" />
          <Skeleton className="mt-3 h-16 w-full" />
          <Skeleton className="mt-6 h-10 w-full" />
        </div>
      ))}
    </section>
  );
}

export default function CatalogPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { isAuthReady, tokens } = useAuth();
  const [apiTemplates, setApiTemplates] = useState<LabTemplate[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CatalogFilter>("All");
  const [isLoading, setIsLoading] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    if (!isAuthReady || !tokens?.access_token) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await getCatalog();
      if (data.length > 0) setApiTemplates(data);
    } catch {
      // API unreachable — seed catalog is used as fallback
    } finally {
      setIsLoading(false);
    }
  }, [isAuthReady, tokens?.access_token]);

  useEffect(() => {
    if (!isAuthReady || !tokens?.access_token) return;
    void Promise.resolve().then(loadCatalog);
  }, [isAuthReady, loadCatalog, tokens?.access_token]);

  const templates = apiTemplates.length > 0 ? apiTemplates : seedCatalog;

  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      const cat = t.category.toLowerCase();
      const matchesFilter = filter === "All" || cat === filter.toLowerCase();
      const matchesQuery =
        !q || [t.title, t.category, t.description, t.difficulty].join(" ").toLowerCase().includes(q);
      return matchesFilter && matchesQuery;
    });
  }, [filter, query, templates]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of templates) {
      const cat = t.category;
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [templates]);

  const handleStart = async (templateId: string) => {
    setStartingId(templateId);
    try {
      const result = await startLab(templateId);
      toast({
        title: "Lab launch requested",
        description: `${result.template} is provisioning.`,
        tone: "success",
      });
      router.push(`/labs/${result.instance_id}`);
    } catch (error) {
      console.error("Failed to start lab", error);
      toast({
        title: "Unable to start lab",
        description: extractApiErrorMessage(error),
        tone: "error",
      });
    } finally {
      setStartingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Lab Catalog</h1>
          <p className="mt-1 max-w-xl text-[13px] text-muted-foreground">
            {templates.length} lab {templates.length === 1 ? "template" : "templates"} across{" "}
            {Object.keys(categoryCounts).length} categories. Pick one and launch.
          </p>
        </div>
        <div className="relative w-full lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search labs..."
            className="h-9 pl-9 text-[13px]"
          />
        </div>
      </header>

      {/* filter tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {filters.map(({ label, icon: Icon }) => {
          const isActive = filter === label;
          const count = label === "All" ? templates.length : (categoryCounts[label] ?? 0);
          return (
            <button
              key={label}
              type="button"
              onClick={() => setFilter(label)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition",
                isActive
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-transparent bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              <span className={cn(
                "ml-0.5 min-w-[18px] rounded-full px-1.5 py-px text-[10px] font-medium",
                isActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground/60"
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">
          {errorMessage}
          <Button type="button" variant="ghost" size="sm" className="ml-2" onClick={loadCatalog}>
            Retry
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <CatalogSkeleton />
      ) : filteredTemplates.length ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onStart={handleStart}
              isStarting={startingId === template.id}
            />
          ))}
        </section>
      ) : (
        <EmptyState
          icon={ShieldAlert}
          title="No labs match"
          description="Try a different category or search term."
        />
      )}
    </div>
  );
}
