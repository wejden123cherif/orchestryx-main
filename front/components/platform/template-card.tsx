import { Clock3, Cpu, Database } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LabTemplate } from "@/lib/types";
import { getDifficultyTone } from "@/lib/utils";

export function TemplateCard({
  template,
  onStart,
  isStarting,
}: {
  template: LabTemplate;
  onStart: (templateId: string) => void;
  isStarting?: boolean;
}) {
  return (
    <article className="app-card flex h-full flex-col p-5 transition hover:border-primary/70">
      <div className="flex items-start justify-between gap-3">
        <Badge>{template.category}</Badge>
        <Badge tone={getDifficultyTone(template.difficulty)}>
          {template.difficulty}
        </Badge>
      </div>

      <Link href={`/catalog/${template.id}` as Route}>
        <h3 className="mt-5 text-lg text-foreground hover:text-indigo-200">
          {template.title}
        </h3>
      </Link>

      <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">
        {template.description}
      </p>

      <div className="mt-5 flex flex-wrap gap-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Database className="h-4 w-4 text-primary" />
          <span>{template.credits_cost} credits</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock3 className="h-4 w-4 text-primary" />
          <span>{template.ttl_hours}h TTL</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Cpu className="h-4 w-4 text-primary" />
          <span>{template.instance_type}</span>
        </div>
      </div>

      <Button
        type="button"
        className="mt-5 w-full"
        disabled={isStarting}
        onClick={() => onStart(template.id)}
      >
        {isStarting ? "Starting..." : "Start Lab"}
      </Button>
    </article>
  );
}
