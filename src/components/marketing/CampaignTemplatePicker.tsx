"use client";

import { FilePlus2, Snowflake } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CAMPAIGN_TEMPLATES } from "@/lib/marketing/campaign-templates";

type Props = {
  value: string;
  onChange: (templateId: string) => void;
};

export function CampaignTemplatePicker({ value, onChange }: Props) {
  return (
    <section aria-labelledby="campaign-template-heading" className="mb-4">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="campaign-template-heading" className="text-sm font-semibold text-foreground">
            Start with a template
          </h2>
          <p className="text-xs text-muted-foreground">
            Templates create an editable draft. Review the audience and messages before activating.
          </p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <button
          type="button"
          aria-pressed={value === "blank"}
          onClick={() => onChange("blank")}
          className={cn(
            "flex min-h-24 items-start gap-3 rounded-lg border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === "blank" && "border-primary bg-primary/5 ring-1 ring-primary/20"
          )}
        >
          <span className="rounded-md bg-muted p-2 text-muted-foreground">
            <FilePlus2 className="h-4 w-4" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-medium text-foreground">Blank campaign</span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              Build a sequence from an empty enrollment trigger.
            </span>
          </span>
        </button>
        {CAMPAIGN_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            aria-pressed={value === template.id}
            onClick={() => onChange(template.id)}
            className={cn(
              "flex min-h-24 items-start gap-3 rounded-lg border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              value === template.id && "border-primary bg-primary/5 ring-1 ring-primary/20"
            )}
          >
            <span className="rounded-md bg-sky-100 p-2 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
              <Snowflake className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">{template.name}</span>
                <Badge variant="secondary" className="text-[10px]">
                  {template.badge}
                </Badge>
              </span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {template.description}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
