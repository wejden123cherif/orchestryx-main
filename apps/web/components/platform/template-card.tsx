import { ArrowRight, Clock3, Cpu, Database } from "lucide-react";
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
    <article className="app-card-interactive flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <Badge>{template.category}</Badge>
        <Badge tone={getDifficultyTone(template.difficulty)}>
          {template.difficulty}
        </Badge>
      </div>

      <Link href={`/catalog/${template.id}` as Route}>
        <h3 className="mt-4 text-[15px] font-semibold text-foreground transition-colors hover:text-primary">
          {template.title}
        </h3>
      </Link>

      <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-muted-foreground line-clamp-3">
        {template.description}
      </p>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Database className="h-3 w-3 text-primary/50" />
          {template.credits_cost} credits
        </span>
        <span className="flex items-center gap-1.5">
          <Clock3 className="h-3 w-3 text-primary/50" />
          {template.ttl_hours}h TTL
        </span>
        <span className="flex items-center gap-1.5">
          <Cpu className="h-3 w-3 text-primary/50" />
          {template.instance_type}
        </span>
      </div>

      <Button
        type="button"
        className="mt-4 w-full gap-2"
        disabled={isStarting}
        onClick={() => onStart(template.id)}
      >
        {isStarting ? "Starting..." : "Launch"}
        {!isStarting && <ArrowRight className="h-3.5 w-3.5" />}
      </Button>
    </article>
  );
}
