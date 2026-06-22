"use client";

import { useEffect, useState } from "react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useCompanySettings } from "@/components/settings/useCompanySettings";
import { MERGE_FIELD_HINTS } from "@/lib/notifications/templates";
import { toast } from "sonner";

type Template = {
  id: string;
  channel: string;
  slug: string;
  name: string;
  subject: string | null;
  body: string;
};

type Rule = {
  id: string;
  event: string;
  enabled: boolean;
  template: Template;
};

export default function SettingsNotificationsPage() {
  const { company, setCompany, loading, saving, save } = useCompanySettings();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ subject: "", body: "" });

  useEffect(() => {
    if (!company) return;
    Promise.all([
      fetch("/api/settings/notifications/templates").then((r) => r.json()),
      fetch("/api/settings/notifications/rules").then((r) => r.json()),
    ])
      .then(([tplData, ruleData]) => {
        setTemplates(tplData.templates ?? []);
        setRules(ruleData.rules ?? []);
      })
      .catch(() => toast.error("Failed to load notification settings"));
  }, [company]);

  async function saveTemplate(id: string) {
    const res = await fetch("/api/settings/notifications/templates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, subject: editDraft.subject, body: editDraft.body }),
    });
    if (!res.ok) {
      toast.error("Failed to save template");
      return;
    }
    const updated = await res.json();
    setTemplates((prev) => prev.map((t) => (t.id === id ? updated : t)));
    setEditingId(null);
    toast.success("Template saved");
  }

  async function toggleRule(id: string, enabled: boolean) {
    const res = await fetch("/api/settings/notifications/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    if (!res.ok) {
      toast.error("Failed to update rule");
      return;
    }
    const updated = await res.json();
    setRules((prev) => prev.map((r) => (r.id === id ? updated : r)));
  }

  if (loading || !company) {
    return (
      <ContentArea className="max-w-3xl">
        <PageHeader breadcrumb={["Settings", "Notifications"]} title="Notifications" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </ContentArea>
    );
  }

  const toggles = [
    { key: "notifyEstimateSent" as const, label: "Estimate sent to customer" },
    { key: "notifyInvoicePaid" as const, label: "Invoice paid" },
    { key: "notifyVisitScheduled" as const, label: "Visit scheduled" },
    { key: "notifyVisitEnRoute" as const, label: "Technician on the way (with ETA)" },
  ];

  return (
    <ContentArea className="max-w-3xl">
      <PageHeader
        breadcrumb={["Settings", "Notifications"]}
        title="Notifications"
        actions={
          <Button size="sm" onClick={() => save(company)} disabled={saving}>
            {saving ? "Saving..." : "Save toggles"}
          </Button>
        }
      />

      <div className="mb-8 space-y-4 rounded-lg border border-border bg-white p-6">
        <h3 className="font-medium">Company notification toggles</h3>
        {toggles.map((t) => (
          <label key={t.key} className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={company[t.key]}
              onCheckedChange={(checked) =>
                setCompany({ ...company, [t.key]: Boolean(checked) })
              }
            />
            {t.label}
          </label>
        ))}
      </div>

      <div className="mb-8 space-y-4 rounded-lg border border-border bg-white p-6">
        <h3 className="font-medium">Notification rules</h3>
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rules configured yet.</p>
        ) : (
          rules.map((rule) => (
            <label key={rule.id} className="flex items-center gap-3 text-sm">
              <Checkbox
                checked={rule.enabled}
                onCheckedChange={(checked) => toggleRule(rule.id, Boolean(checked))}
              />
              <span>
                <span className="font-medium">{rule.event.replace(/_/g, " ")}</span>
                <span className="text-muted-foreground">
                  {" "}
                  — {rule.template.name} ({rule.template.channel})
                </span>
              </span>
            </label>
          ))
        )}
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-white p-6">
        <h3 className="font-medium">Templates</h3>
        <p className="text-xs text-muted-foreground">
          Merge fields: {MERGE_FIELD_HINTS.join(", ")}
        </p>
        {templates.map((tpl) => (
          <div key={tpl.id} className="rounded-md border border-border p-4">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="font-medium">{tpl.name}</p>
                <p className="text-xs text-muted-foreground">
                  {tpl.slug} · {tpl.channel}
                </p>
              </div>
              {editingId !== tpl.id && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingId(tpl.id);
                    setEditDraft({ subject: tpl.subject ?? "", body: tpl.body });
                  }}
                >
                  Edit
                </Button>
              )}
            </div>
            {editingId === tpl.id ? (
              <div className="space-y-3">
                {tpl.channel === "EMAIL" && (
                  <Input
                    placeholder="Subject"
                    value={editDraft.subject}
                    onChange={(e) =>
                      setEditDraft({ ...editDraft, subject: e.target.value })
                    }
                  />
                )}
                <textarea
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  value={editDraft.body}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, body: e.target.value })
                  }
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveTemplate(tpl.id)}>
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <pre className="whitespace-pre-wrap text-sm text-muted-foreground">
                {tpl.channel === "EMAIL" && tpl.subject ? `Subject: ${tpl.subject}\n\n` : ""}
                {tpl.body}
              </pre>
            )}
          </div>
        ))}
      </div>
    </ContentArea>
  );
}
