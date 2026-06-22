"use client";

import { useState } from "react";
import type { CampaignChannel, CampaignType } from "@prisma/client";
import { toast } from "sonner";
import { AudienceBuilder } from "@/components/marketing/AudienceBuilder";
import { EmailCampaignEditor } from "@/components/marketing/EmailCampaignEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CampaignFormState, CampaignStepInput } from "@/lib/marketing/types";

type Props = {
  initial?: Partial<CampaignFormState> & { id?: string };
  onSaved: (campaignId: string) => void;
};

const defaultForm: CampaignFormState = {
  name: "",
  type: "BLAST",
  channel: "EMAIL",
  subject: "",
  bodyText: "",
  bodyHtml: "",
  aiPrompt: "",
  audienceFilters: {},
  dripSettings: { emailsPerDay: 50, smsPerDay: 50 },
  steps: [],
};

export function CampaignWizard({ initial, onSaved }: Props) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CampaignFormState>({
    ...defaultForm,
    ...initial,
    audienceFilters: initial?.audienceFilters ?? {},
    dripSettings: { ...defaultForm.dripSettings, ...initial?.dripSettings },
    steps: initial?.steps ?? [],
  });
  const campaignId = initial?.id;

  function update<K extends keyof CampaignFormState>(key: K, value: CampaignFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addDripStep() {
    const next: CampaignStepInput = {
      sortOrder: form.steps.length,
      channel: form.channel,
      subject: "",
      bodyText: "",
      bodyHtml: "",
      delayDays: form.steps.length === 0 ? 0 : 3,
    };
    update("steps", [...form.steps, next]);
  }

  function updateStep(index: number, partial: Partial<CampaignStepInput>) {
    update(
      "steps",
      form.steps.map((s, i) => (i === index ? { ...s, ...partial } : s))
    );
  }

  function removeStep(index: number) {
    update(
      "steps",
      form.steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, sortOrder: i }))
    );
  }

  async function saveDraft() {
    if (!form.name.trim()) {
      toast.error("Campaign name is required");
      return null;
    }
    if (!form.bodyText.trim() && form.type === "BLAST" && form.channel === "SMS") {
      toast.error("Message is required");
      return null;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name,
        type: form.type,
        channel: form.channel,
        subject: form.subject || null,
        bodyText: form.bodyText || form.name,
        bodyHtml: form.bodyHtml || null,
        aiPrompt: form.aiPrompt || null,
        audienceFilters: form.audienceFilters,
        dripSettings: form.type === "DRIP" ? form.dripSettings : null,
        steps: form.type === "DRIP" ? form.steps : undefined,
      };

      const url = campaignId ? `/api/marketing/campaigns/${campaignId}` : "/api/marketing/campaigns";
      const method = campaignId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");

      if (form.type === "DRIP" && form.steps.length > 0) {
        await fetch(`/api/marketing/campaigns/${data.id ?? campaignId}/steps`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ steps: form.steps }),
        });
      }

      toast.success("Draft saved");
      return (data.id ?? campaignId) as string;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function finish(action: "send" | "activate") {
    const id = (await saveDraft()) ?? campaignId;
    if (!id) return;

    setSaving(true);
    try {
      const endpoint =
        action === "activate"
          ? `/api/marketing/campaigns/${id}/activate`
          : `/api/marketing/campaigns/${id}/send`;
      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      toast.success(action === "activate" ? "Drip campaign activated" : "Campaign sent");
      onSaved(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const stepLabels =
    form.type === "DRIP"
      ? ["Setup", "Audience", "Sequence", "Review"]
      : ["Setup", "Audience", "Content", "Review"];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {stepLabels.map((label, index) => (
          <span key={label} className={step >= index + 1 ? "font-medium text-foreground" : ""}>
            {index + 1}. {label}
          </span>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4 rounded-lg border bg-white p-6">
          <div>
            <label className="text-sm font-medium">Campaign name</label>
            <Input className="mt-1" value={form.name} onChange={(e) => update("name", e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Campaign type</label>
            <div className="mt-2 flex gap-2">
              {(["BLAST", "DRIP"] as CampaignType[]).map((type) => (
                <Button
                  key={type}
                  type="button"
                  variant={form.type === type ? "default" : "outline"}
                  onClick={() => update("type", type)}
                >
                  {type === "BLAST" ? "Blast" : "Drip sequence"}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Primary channel</label>
            <div className="mt-2 flex gap-2">
              {(["EMAIL", "SMS"] as CampaignChannel[]).map((channel) => (
                <Button
                  key={channel}
                  type="button"
                  variant={form.channel === channel ? "default" : "outline"}
                  onClick={() => update("channel", channel)}
                >
                  {channel}
                </Button>
              ))}
            </div>
          </div>
          <Button type="button" disabled={!form.name.trim()} onClick={() => setStep(2)}>
            Continue
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="rounded-lg border bg-white p-6">
          <AudienceBuilder
            channel={form.channel}
            filters={form.audienceFilters}
            onChange={(filters) => update("audienceFilters", filters)}
          />
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button type="button" onClick={() => setStep(3)}>
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 3 && form.type === "BLAST" && form.channel === "EMAIL" && (
        <div className="space-y-4">
          <EmailCampaignEditor
            subject={form.subject}
            bodyHtml={form.bodyHtml}
            aiPrompt={form.aiPrompt}
            onSubjectChange={(subject) => update("subject", subject)}
            onAiPromptChange={(aiPrompt) => update("aiPrompt", aiPrompt)}
            onBodyChange={(bodyHtml, bodyText) => {
              update("bodyHtml", bodyHtml);
              update("bodyText", bodyText);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => saveDraft()}>
              Save draft
            </Button>
            <Button type="button" onClick={() => setStep(4)}>
              Review
            </Button>
          </div>
        </div>
      )}

      {step === 3 && form.type === "BLAST" && form.channel === "SMS" && (
        <div className="space-y-4 rounded-lg border bg-white p-6">
          <div>
            <label className="text-sm font-medium">SMS message</label>
            <textarea
              className="mt-1 min-h-[140px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={form.bodyText}
              onChange={(e) => update("bodyText", e.target.value)}
              placeholder="Your SMS message. Reply STOP to opt out will be appended."
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => saveDraft()}>
              Save draft
            </Button>
            <Button type="button" onClick={() => setStep(4)}>
              Review
            </Button>
          </div>
        </div>
      )}

      {step === 3 && form.type === "DRIP" && (
        <div className="space-y-4 rounded-lg border bg-white p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-sm font-medium">Emails per day</label>
              <Input
                type="number"
                className="mt-1"
                value={form.dripSettings.emailsPerDay ?? 50}
                onChange={(e) =>
                  update("dripSettings", {
                    ...form.dripSettings,
                    emailsPerDay: Number(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium">SMS per day</label>
              <Input
                type="number"
                className="mt-1"
                value={form.dripSettings.smsPerDay ?? 50}
                onChange={(e) =>
                  update("dripSettings", {
                    ...form.dripSettings,
                    smsPerDay: Number(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium">Start date</label>
              <Input
                type="date"
                className="mt-1"
                value={form.dripSettings.startAt?.slice(0, 10) ?? ""}
                onChange={(e) =>
                  update("dripSettings", {
                    ...form.dripSettings,
                    startAt: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                  })
                }
              />
            </div>
          </div>

          {form.steps.map((dripStep, index) => (
            <div key={index} className="rounded border p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-medium">Step {index + 1}</p>
                <Button type="button" variant="ghost" size="sm" onClick={() => removeStep(index)}>
                  Remove
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-muted-foreground">Channel</label>
                  <select
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={dripStep.channel}
                    onChange={(e) =>
                      updateStep(index, { channel: e.target.value as CampaignChannel })
                    }
                  >
                    <option value="EMAIL">Email</option>
                    <option value="SMS">SMS</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Delay (days)</label>
                  <Input
                    type="number"
                    className="mt-1"
                    value={dripStep.delayDays ?? 0}
                    onChange={(e) => updateStep(index, { delayDays: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
              {dripStep.channel === "EMAIL" && (
                <Input
                  className="mt-3"
                  placeholder="Subject"
                  value={dripStep.subject ?? ""}
                  onChange={(e) => updateStep(index, { subject: e.target.value })}
                />
              )}
              <textarea
                className="mt-3 min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={dripStep.bodyText}
                onChange={(e) => updateStep(index, { bodyText: e.target.value })}
                placeholder={dripStep.channel === "SMS" ? "SMS body" : "Email body (plain text or HTML)"}
              />
            </div>
          ))}

          <Button type="button" variant="outline" onClick={addDripStep}>
            Add step
          </Button>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => saveDraft()}>
              Save draft
            </Button>
            <Button type="button" disabled={form.steps.length === 0} onClick={() => setStep(4)}>
              Review
            </Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4 rounded-lg border bg-white p-6">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium">{form.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Type</dt>
              <dd className="font-medium">{form.type}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Channel</dt>
              <dd className="font-medium">{form.channel}</dd>
            </div>
            {form.type === "BLAST" && form.channel === "EMAIL" && (
              <div>
                <dt className="text-muted-foreground">Subject</dt>
                <dd className="font-medium">{form.subject || "—"}</dd>
              </div>
            )}
            {form.type === "DRIP" && (
              <div>
                <dt className="text-muted-foreground">Steps</dt>
                <dd className="font-medium">{form.steps.length}</dd>
              </div>
            )}
          </dl>

          {form.type === "BLAST" && form.channel === "EMAIL" && form.bodyHtml && (
            <div className="overflow-hidden rounded border">
              <iframe title="Review" className="h-80 w-full" srcDoc={form.bodyHtml} />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(3)}>
              Back
            </Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => saveDraft()}>
              Save draft
            </Button>
            {form.type === "DRIP" ? (
              <Button type="button" disabled={saving} onClick={() => finish("activate")}>
                {saving ? "Activating..." : "Activate drip"}
              </Button>
            ) : (
              <Button type="button" disabled={saving} onClick={() => finish("send")}>
                {saving ? "Sending..." : "Send now"}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
