"use client";

import { useEffect, useState } from "react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useCompanySettings } from "@/components/settings/useCompanySettings";
import { EVENT_LABELS, MERGE_FIELD_HINTS, NOTIFICATION_EVENTS } from "@/lib/notifications/templates";
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

const TOGGLE_KEYS = [
  { key: "notifyVisitScheduled", label: "Visit scheduled" },
  { key: "notifyVisitTimeUpdated", label: "Visit time updated" },
  { key: "notifyVisitCancelled", label: "Visit cancelled" },
  { key: "notifyVisitCompleted", label: "Visit completed" },
  { key: "notifyVisitEnRoute", label: "Technician on the way (ETA)" },
  { key: "notifyReviewRequest", label: "Review request" },
  { key: "notifyFeedbackSurvey", label: "Feedback survey" },
  { key: "notifyInvoicePaid", label: "Invoice paid receipt" },
  { key: "notifyEstimateSent", label: "Estimate sent (manual)" },
  { key: "notifyEstimateFollowUp", label: "Estimate follow-ups (open estimates)" },
] as const;

export default function SettingsNotificationsPage() {
  const { company, setCompany, loading, saving, save } = useCompanySettings();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ subject: "", body: "" });
  const [testSending, setTestSending] = useState(false);

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
      .catch(() => toast.error("Failed to load communications settings"));
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

  function insertMergeField(field: string) {
    setEditDraft((prev) => ({ ...prev, body: `${prev.body}${field}` }));
  }

  async function sendTest() {
    setTestSending(true);
    try {
      const res = await fetch("/api/settings/notifications/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(data.message ?? "Test notification sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test send failed");
    } finally {
      setTestSending(false);
    }
  }

  if (loading || !company) {
    return (
      <ContentArea className="max-w-4xl">
        <PageHeader breadcrumb={["Settings", "Communications"]} title="Communications" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </ContentArea>
    );
  }

  return (
    <ContentArea className="max-w-4xl">
      <PageHeader
        breadcrumb={["Settings", "Communications"]}
        title="Communications"
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={sendTest} disabled={testSending}>
              {testSending ? "Sending…" : "Send test"}
            </Button>
            <Button size="sm" onClick={() => save(company)} disabled={saving}>
              {saving ? "Saving…" : "Save settings"}
            </Button>
          </div>
        }
      />

      <div className="mb-8 space-y-4 rounded-lg border bg-card p-6">
        <h3 className="font-medium">Company links & timing</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <label className="text-sm font-medium">Google review URL</label>
            <Input
              value={company.googleReviewUrl ?? ""}
              onChange={(e) => setCompany({ ...company, googleReviewUrl: e.target.value || null })}
              placeholder="https://g.page/r/..."
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-sm font-medium">Website base URL</label>
            <Input
              value={company.websiteBaseUrl ?? ""}
              onChange={(e) => setCompany({ ...company, websiteBaseUrl: e.target.value || null })}
              placeholder="https://yoursite.com"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Arrival window (hours)</label>
            <Input
              type="number"
              min={1}
              max={12}
              value={company.arrivalWindowHours ?? 3}
              onChange={(e) =>
                setCompany({ ...company, arrivalWindowHours: Number(e.target.value) || 3 })
              }
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Review request delay (hours)</label>
            <Input
              type="number"
              min={0}
              value={company.reviewRequestDelayHours ?? 2}
              onChange={(e) =>
                setCompany({ ...company, reviewRequestDelayHours: Number(e.target.value) || 0 })
              }
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Feedback survey delay (hours)</label>
            <Input
              type="number"
              min={0}
              value={company.feedbackSurveyDelayHours ?? 24}
              onChange={(e) =>
                setCompany({ ...company, feedbackSurveyDelayHours: Number(e.target.value) || 0 })
              }
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Estimate follow-up interval (days)</label>
            <Input
              type="number"
              min={1}
              max={30}
              value={company.estimateFollowUpIntervalDays ?? 3}
              onChange={(e) =>
                setCompany({
                  ...company,
                  estimateFollowUpIntervalDays: Math.max(1, Number(e.target.value) || 3),
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              Sends SMS and email reminders for estimates still awaiting approval.
            </p>
          </div>
        </div>
      </div>

      <div className="mb-8 space-y-3 rounded-lg border bg-card p-6">
        <h3 className="font-medium">Automated notifications</h3>
        <p className="text-xs text-muted-foreground">
          Customers marked Do Not Service are excluded from all messages.
        </p>
        {TOGGLE_KEYS.map((t) => (
          <label key={t.key} className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={Boolean(company[t.key as keyof typeof company])}
              onCheckedChange={(checked) =>
                setCompany({ ...company, [t.key]: Boolean(checked) })
              }
            />
            {t.label}
          </label>
        ))}
      </div>

      <div className="space-y-6">
        {NOTIFICATION_EVENTS.map((event) => {
          const eventRules = rules.filter((r) => r.event === event);
          if (eventRules.length === 0) return null;
          return (
            <section key={event} className="rounded-lg border bg-card p-6">
              <h3 className="mb-4 font-medium">{EVENT_LABELS[event]}</h3>
              <div className="mb-4 space-y-2">
                {eventRules.map((rule) => (
                  <label key={rule.id} className="flex items-center gap-3 text-sm">
                    <Checkbox
                      checked={rule.enabled}
                      onCheckedChange={(checked) => toggleRule(rule.id, Boolean(checked))}
                    />
                    {rule.template.channel} — {rule.template.name}
                  </label>
                ))}
              </div>
              {eventRules.map((rule) => {
                const tpl = rule.template;
                return (
                  <div key={tpl.id} className="mb-4 rounded-md border p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium">
                        {tpl.channel} template
                      </p>
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
                        <div className="flex flex-wrap gap-1">
                          {MERGE_FIELD_HINTS.map((f) => (
                            <Button
                              key={f}
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => insertMergeField(f)}
                            >
                              {f}
                            </Button>
                          ))}
                        </div>
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
                );
              })}
            </section>
          );
        })}
      </div>
    </ContentArea>
  );
}
