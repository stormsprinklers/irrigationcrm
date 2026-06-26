"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useCompanySettings } from "@/components/settings/useCompanySettings";
import {
  EVENT_LABELS,
  MERGE_FIELD_HINTS,
  NOTIFICATION_EVENTS,
  type NotificationEvent,
} from "@/lib/notifications/templates";
import type { CompanySettingsDTO } from "@/lib/company/types";
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

const EVENT_COMPANY_TOGGLE: Partial<
  Record<NotificationEvent, { key: keyof CompanySettingsDTO; label: string }>
> = {
  VISIT_SCHEDULED: { key: "notifyVisitScheduled", label: "Send visit scheduled notifications" },
  VISIT_TIME_UPDATED: { key: "notifyVisitTimeUpdated", label: "Send visit time updated notifications" },
  VISIT_CANCELLED: { key: "notifyVisitCancelled", label: "Send visit cancelled notifications" },
  VISIT_COMPLETED: { key: "notifyVisitCompleted", label: "Send visit completed notifications" },
  VISIT_EN_ROUTE: { key: "notifyVisitEnRoute", label: "Send on-the-way notifications" },
  REVIEW_REQUEST: { key: "notifyReviewRequest", label: "Send review requests" },
  FEEDBACK_SURVEY: { key: "notifyFeedbackSurvey", label: "Send feedback surveys" },
  INVOICE_PAID_RECEIPT: { key: "notifyInvoicePaid", label: "Send invoice paid receipts" },
  ESTIMATE_SENT: { key: "notifyEstimateSent", label: "Send estimate sent notifications" },
  ESTIMATE_FOLLOW_UP: { key: "notifyEstimateFollowUp", label: "Send estimate follow-ups" },
};

type TimingField = {
  key: keyof CompanySettingsDTO;
  label: string;
  hint?: string;
  min?: number;
  max?: number;
};

const EVENT_TIMING_FIELDS: Partial<Record<NotificationEvent, TimingField[]>> = {
  VISIT_SCHEDULED: [
    {
      key: "arrivalWindowHours",
      label: "Arrival window (hours)",
      hint: "Used in scheduled and rescheduled visit messages.",
      min: 1,
      max: 12,
    },
  ],
  REVIEW_REQUEST: [
    {
      key: "reviewRequestDelayHours",
      label: "Delay after visit (hours)",
      min: 0,
    },
  ],
  FEEDBACK_SURVEY: [
    {
      key: "feedbackSurveyDelayHours",
      label: "Delay after visit (hours)",
      min: 0,
    },
  ],
  ESTIMATE_FOLLOW_UP: [
    {
      key: "estimateFollowUpIntervalDays",
      label: "Follow-up interval (days)",
      hint: "Sends SMS and email reminders for estimates still awaiting approval.",
      min: 1,
      max: 30,
    },
  ],
};

const EVENT_LINK_FIELDS: Partial<
  Record<NotificationEvent, { key: keyof CompanySettingsDTO; label: string; placeholder: string }>
> = {
  REVIEW_REQUEST: {
    key: "googleReviewUrl",
    label: "Google review URL",
    placeholder: "https://g.page/r/...",
  },
  ESTIMATE_SENT: {
    key: "websiteBaseUrl",
    label: "Website base URL",
    placeholder: "https://yoursite.com",
  },
  ESTIMATE_FOLLOW_UP: {
    key: "websiteBaseUrl",
    label: "Website base URL",
    placeholder: "https://yoursite.com",
  },
};

function NotificationSection({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      className="group rounded-lg border bg-card"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="font-medium">{title}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t px-4 py-4">{children}</div>
    </details>
  );
}

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
    setRules((prev) =>
      prev.map((rule) =>
        rule.template.id === id ? { ...rule, template: updated } : rule
      )
    );
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

      <p className="mb-4 text-sm text-muted-foreground">
        Customers marked Do Not Service are excluded from all automated messages.
      </p>

      <div className="space-y-3">
        {NOTIFICATION_EVENTS.map((event) => {
          const eventRules = rules.filter((r) => r.event === event);
          if (eventRules.length === 0) return null;

          const companyToggle = EVENT_COMPANY_TOGGLE[event];
          const timingFields = EVENT_TIMING_FIELDS[event] ?? [];
          const linkField = EVENT_LINK_FIELDS[event];
          const isEnabled = companyToggle
            ? Boolean(company[companyToggle.key])
            : eventRules.some((r) => r.enabled);

          return (
            <NotificationSection
              key={event}
              title={EVENT_LABELS[event]}
              defaultOpen={event === "VISIT_EN_ROUTE"}
            >
              {companyToggle ? (
                <label className="flex items-center gap-3 text-sm">
                  <Checkbox
                    checked={Boolean(company[companyToggle.key])}
                    onCheckedChange={(checked) =>
                      setCompany({ ...company, [companyToggle.key]: Boolean(checked) })
                    }
                  />
                  {companyToggle.label}
                </label>
              ) : null}

              {event === "VISIT_EN_ROUTE" ? (
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox
                    checked={Boolean(company.notifyVisitEnRouteIncludeTechnicianPhoto)}
                    onCheckedChange={(checked) =>
                      setCompany({
                        ...company,
                        notifyVisitEnRouteIncludeTechnicianPhoto: Boolean(checked),
                      })
                    }
                    disabled={!company.notifyVisitEnRoute}
                  />
                  <span>
                    <span className="font-medium">Include technician photo in SMS</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Sends the assigned technician&apos;s profile photo as an MMS attachment when
                      they tap On the way. Requires a photo on the employee profile.
                    </span>
                  </span>
                </label>
              ) : null}

              {linkField ? (
                <div className="space-y-1">
                  <label className="text-sm font-medium">{linkField.label}</label>
                  <Input
                    value={(company[linkField.key] as string | null) ?? ""}
                    onChange={(e) =>
                      setCompany({ ...company, [linkField.key]: e.target.value || null })
                    }
                    placeholder={linkField.placeholder}
                  />
                </div>
              ) : null}

              {timingFields.map((field) => (
                <div key={String(field.key)} className="space-y-1">
                  <label className="text-sm font-medium">{field.label}</label>
                  <Input
                    type="number"
                    min={field.min}
                    max={field.max}
                    value={Number(company[field.key]) || 0}
                    onChange={(e) =>
                      setCompany({
                        ...company,
                        [field.key]: Number(e.target.value) || 0,
                      })
                    }
                  />
                  {field.hint ? (
                    <p className="text-xs text-muted-foreground">{field.hint}</p>
                  ) : null}
                </div>
              ))}

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Channels
                </p>
                {eventRules.map((rule) => (
                  <label key={rule.id} className="flex items-center gap-3 text-sm">
                    <Checkbox
                      checked={rule.enabled}
                      onCheckedChange={(checked) => toggleRule(rule.id, Boolean(checked))}
                      disabled={companyToggle ? !isEnabled : false}
                    />
                    {rule.template.channel} — {rule.template.name}
                  </label>
                ))}
              </div>

              {eventRules.map((rule) => {
                const tpl = rule.template;
                return (
                  <div key={tpl.id} className="rounded-md border p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium">{tpl.channel} template</p>
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
            </NotificationSection>
          );
        })}
      </div>
    </ContentArea>
  );
}
