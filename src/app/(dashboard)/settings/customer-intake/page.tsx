"use client";

import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { INTAKE_FIELD_OPTIONS } from "@/lib/company/types";
import { useCompanySettings } from "@/components/settings/useCompanySettings";

export default function SettingsCustomerIntakePage() {
  const { company, setCompany, loading, saving, save } = useCompanySettings();

  if (loading || !company) {
    return (
      <ContentArea className="max-w-2xl">
        <PageHeader breadcrumb={["Settings", "Customer Intake"]} title="Customer Intake" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </ContentArea>
    );
  }

  function toggleField(field: string) {
    if (!company) return;
    const required = company.intakeRequiredFields.includes(field)
      ? company.intakeRequiredFields.filter((f) => f !== field)
      : [...company.intakeRequiredFields, field];
    setCompany({ ...company, intakeRequiredFields: required });
  }

  return (
    <ContentArea className="max-w-2xl">
      <PageHeader
        breadcrumb={["Settings", "Customer Intake"]}
        title="Customer Intake"
        actions={<Button size="sm" onClick={() => save(company)} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>}
      />
      <div className="space-y-3 rounded-lg border border-border bg-white p-6">
        <p className="text-sm text-muted-foreground">Select required fields when creating a new customer.</p>
        {INTAKE_FIELD_OPTIONS.map((field) => (
          <label key={field} className="flex items-center gap-3 text-sm capitalize">
            <Checkbox
              checked={company.intakeRequiredFields.includes(field)}
              onCheckedChange={() => toggleField(field)}
            />
            {field.replace(/([A-Z])/g, " $1")}
          </label>
        ))}
      </div>
    </ContentArea>
  );
}
