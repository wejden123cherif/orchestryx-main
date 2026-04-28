"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Search } from "lucide-react";
import { EmptyState } from "@/components/platform/empty-state";
import { TemplateCard } from "@/components/platform/template-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { extractApiErrorMessage, getCatalog, startLab } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type { CatalogFilter, LabTemplate } from "@/lib/types";
import { cn } from "@/lib/utils";

const filters: CatalogFilter[] = ["All", "Web", "Network", "Active Directory", "DFIR", "Malware"];

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
  const [templates, setTemplates] = useState<LabTemplate[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CatalogFilter>("All");
  const [isLoading, setIsLoading] = useState(true);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    if (!isAuthReady || !tokens?.access_token) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      setTemplates(await getCatalog());
    } catch (error) {
      console.error("Failed to load catalog", error);
      setErrorMessage(extractApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [isAuthReady, tokens?.access_token]);

  useEffect(() => {
    if (!isAuthReady || !tokens?.access_token) {
      return;
    }

    void Promise.resolve().then(loadCatalog);
  }, [isAuthReady, loadCatalog, tokens?.access_token]);

  const filteredTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return templates.filter((template) => {
      const category = template.category.toLowerCase();
      const matchesFilter =
        filter === "All" || category.includes(filter.toLowerCase());
      const matchesQuery =
        !normalizedQuery ||
        [template.title, template.category, template.description]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesFilter && matchesQuery;
    });
  }, [filter, query, templates]);

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
          <h1 className="text-3xl text-foreground">Lab Catalog</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Browse provisionable AWS lab templates. Each launch uses the existing backend `/labs/start` contract.
          </p>
        </div>
        <div className="relative w-full lg:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search labs"
            className="pl-9"
          />
        </div>
      </header>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {filters.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm",
              filter === item
                ? "border-primary bg-primary/10 text-indigo-200"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            {item}
          </button>
        ))}
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm text-red-300">
          {errorMessage}
          <Button type="button" variant="ghost" size="sm" className="ml-2" onClick={loadCatalog}>
            Retry
          </Button>
        </div>
      ) : null}

      {!isAuthReady || !tokens?.access_token || isLoading ? (
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
          icon={Boxes}
          title="No labs match this view"
          description="Try another category or search term. If the API is unavailable, the catalog will remain empty without breaking the page."
        />
      )}
    </div>
  );
}
