"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TemplateWizard } from "@/components/maintenance-plans/TemplateWizard";
import type { MaintenancePlanTemplateDTO } from "@/lib/maintenance-plans/types";

export function EditTemplateClient({ templateId }: { templateId: string }) {
  const [template, setTemplate] = useState<MaintenancePlanTemplateDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/maintenance-plans/templates/${templateId}`)
      .then(async (res) => {
        if (res.ok) setTemplate(await res.json());
        else toast.error("Template not found");
      })
      .catch(() => toast.error("Failed to load template"))
      .finally(() => setLoading(false));
  }, [templateId]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading template...</p>;
  if (!template) return <p className="text-sm text-muted-foreground">Template not found.</p>;

  return <TemplateWizard templateId={templateId} initial={template} />;
}
