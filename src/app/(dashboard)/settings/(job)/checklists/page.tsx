"use client";

import { ChecklistTemplateList } from "@/components/settings/checklists/ChecklistTemplateList";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useCompanySettings } from "@/components/settings/useCompanySettings";

export default function ChecklistsSettingsPage() {
  const { company, setCompany, loading, saving, save } = useCompanySettings();

  return (
    <ContentArea className="max-w-4xl">
      <PageHeader
        breadcrumb={["Settings", "Visits", "Checklists"]}
        title="Checklists"
        subtitle="Create checklists technicians complete on visits. Control when they apply and whether they are required to finish."
        actions={
          company ? (
            <Button size="sm" onClick={() => save(company)} disabled={saving}>
              {saving ? "Saving..." : "Save settings"}
            </Button>
          ) : null
        }
      />

      <div className="mb-6 rounded-lg border border-border bg-white p-4">
        {loading || !company ? (
          <p className="text-sm text-muted-foreground">Loading settings…</p>
        ) : (
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={company.mergeVisitChecklists === true}
              onCheckedChange={(checked) =>
                setCompany({ ...company, mergeVisitChecklists: checked === true })
              }
            />
            <span>
              <span className="font-medium">Merge checklists on visits</span>
              <span className="mt-0.5 block text-muted-foreground">
                When a visit gets a main/division checklist plus line-item checklists, show them as
                one combined checklist instead of separate cards.
              </span>
            </span>
          </label>
        )}
      </div>

      <ChecklistTemplateList />
    </ContentArea>
  );
}
