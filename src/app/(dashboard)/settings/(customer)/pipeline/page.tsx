"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { PipelineFollowUpSettings } from "@/lib/customers/pipeline-followup-settings";

type EmployeeOption = {
  id: string;
  name: string;
};

export default function PipelineSettingsPage() {
  const [enabled, setEnabled] = useState(false);
  const [settings, setSettings] = useState<PipelineFollowUpSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings/pipeline-followups"),
      fetch("/api/settings/employees?status=ACTIVE"),
    ])
      .then(async ([settingsResponse, employeesResponse]) => {
        const body = await settingsResponse.json();
        if (!settingsResponse.ok) throw new Error(body.error ?? "Could not load settings");
        setEnabled(body.enabled);
        setSettings(body.settings);

        if (employeesResponse.ok) {
          const employeeBody = await employeesResponse.json();
          setEmployees(
            Array.isArray(employeeBody)
              ? employeeBody
                  .filter(
                    (employee): employee is EmployeeOption =>
                      typeof employee?.id === "string" && typeof employee?.name === "string"
                  )
                  .sort((a, b) => a.name.localeCompare(b.name))
              : []
          );
        }
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Could not load settings"))
      .finally(() => setLoading(false));
  }, []);

  function update(stage: "lead" | "qualified", index: number, field: string, value: string | number) {
    setSettings((current) => {
      if (!current) return current;
      const items = current[stage].map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item);
      return { ...current, [stage]: items };
    });
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/pipeline-followups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, settings }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not save settings");
      toast.success("Pipeline follow-up settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ContentArea className="max-w-4xl">
      <PageHeader
        breadcrumb={["Settings", "Customer", "Pipeline"]}
        title="Pipeline follow-ups"
        subtitle="Configure the three lead and qualified-lead follow-ups. Automation is off until you enable and save it."
        actions={<Button onClick={() => void save()} disabled={saving || !settings}>{saving ? "Saving…" : "Save"}</Button>}
      />
      {loading || !settings ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <div className="space-y-6">
          <label className="flex items-center justify-between rounded-lg border bg-card p-4">
            <span>
              <span className="block font-medium">Automated follow-ups</span>
              <span className="text-sm text-muted-foreground">Send eligible SMS and email follow-ups automatically. Existing customers are paused when first enabled.</span>
            </span>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </label>
          <section className="space-y-2 rounded-lg border bg-card p-4">
            <label htmlFor="pipeline-follow-up-sender" className="block font-medium">
              Automated follow-up sender
            </label>
            <p className="text-sm text-muted-foreground">
              This employee&apos;s first name will be used for every automated SMS and email.
              Leave it unselected to use the employee assigned to the lead, then the company&apos;s
              default lead assignee.
            </p>
            <select
              id="pipeline-follow-up-sender"
              className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm"
              value={settings.senderUserId ?? ""}
              onChange={(event) =>
                setSettings((current) =>
                  current ? { ...current, senderUserId: event.target.value || null } : current
                )
              }
            >
              <option value="">Use the assigned employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </section>
          {(["lead", "qualified"] as const).map((stage) => (
            <section key={stage} className="space-y-3">
              <h2 className="text-lg font-semibold capitalize">{stage} follow-ups</h2>
              {settings[stage].map((item, index) => (
                <div key={index} className="space-y-3 rounded-lg border bg-card p-4">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="font-medium">Follow-up {index + 1}</h3>
                    <label className="flex items-center gap-2 text-sm">After <Input className="w-24" type="number" min={1} value={item.delayHours} onChange={(e) => update(stage, index, "delayHours", Number(e.target.value))} /> hours</label>
                  </div>
                  <label className="block text-sm font-medium">SMS<textarea className="mt-1 min-h-24 w-full rounded-md border bg-background p-3 font-normal" value={item.sms} onChange={(e) => update(stage, index, "sms", e.target.value)} /></label>
                  <label className="block text-sm font-medium">Email subject<Input className="mt-1" value={item.emailSubject} onChange={(e) => update(stage, index, "emailSubject", e.target.value)} /></label>
                  <label className="block text-sm font-medium">Email body<textarea className="mt-1 min-h-32 w-full rounded-md border bg-background p-3 font-normal" value={item.emailBody} onChange={(e) => update(stage, index, "emailBody", e.target.value)} /></label>
                </div>
              ))}
            </section>
          ))}
          <p className="text-xs text-muted-foreground">Available variables: {`{customer first name}`}, {`{employee}`}, {`{company}`}.</p>
        </div>
      )}
    </ContentArea>
  );
}
