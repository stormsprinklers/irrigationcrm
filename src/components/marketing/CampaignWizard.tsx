"use client";

import { useState } from "react";
import type { CampaignChannel, CampaignType } from "@prisma/client";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { AudienceBuilder } from "@/components/marketing/AudienceBuilder";
import { CampaignFlowEditor } from "@/components/marketing/CampaignFlowEditor";
import { EmailCampaignEditor } from "@/components/marketing/EmailCampaignEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  CampaignFlowNodeInput,
  CampaignFormState,
} from "@/lib/marketing/types";
import { cn } from "@/lib/utils";

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
  flowNodes: [],
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
    flowNodes: initial?.flowNodes ?? [],
  });
  const campaignId = initial?.id;

  function update<K extends keyof CampaignFormState>(key: K, value: CampaignFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
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
    if (form.type === "DRIP" && form.flowNodes.length === 0 && form.steps.length === 0) {
      toast.error("Add at least one automation step");
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

      const id = (data.id ?? campaignId) as string;

      if (form.type === "DRIP" && form.flowNodes.length > 0) {
        const flowRes = await fetch(`/api/marketing/campaigns/${id}/flow`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nodes: form.flowNodes }),
        });
        const flowData = await flowRes.json();
        if (!flowRes.ok) throw new Error(flowData.error ?? "Failed to save flow");
        if (Array.isArray(flowData.nodes)) {
          update(
            "flowNodes",
            flowData.nodes.map(
              (n: { id: string; type: CampaignFlowNodeInput["type"]; config: Record<string, unknown>; sortOrder: number }) => ({
                id: n.id,
                type: n.type,
                config: (n.config ?? {}) as Record<string, unknown>,
                sortOrder: n.sortOrder,
              })
            )
          );
        }
      } else if (form.type === "DRIP" && form.steps.length > 0) {
        await fetch(`/api/marketing/campaigns/${id}/steps`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ steps: form.steps }),
        });
      }

      toast.success("Draft saved");
      return id;
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
      toast.success(
        action === "activate" ? "Automation activated" : "Campaign sent"
      );
      onSaved(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const stepLabels =
    form.type === "DRIP"
      ? ["Setup", "Audience", "Automation", "Review"]
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
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {(
                [
                  {
                    type: "BLAST" as CampaignType,
                    title: "Blast",
                    description:
                      "Send one email or SMS to your whole audience right away (or on a schedule). Best for announcements and one-time offers.",
                  },
                  {
                    type: "DRIP" as CampaignType,
                    title: "Automation",
                    description:
                      "A multi-step sequence with waits and branches (opened email? clicked link?). Enroll from your audience or from triggers like a completed job.",
                  },
                ] as const
              ).map((option) => (
                <button
                  key={option.type}
                  type="button"
                  onClick={() => update("type", option.type)}
                  className={cn(
                    "rounded-lg border p-4 text-left transition-colors",
                    form.type === option.type
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border hover:bg-muted/40"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{option.title}</span>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {option.description}
                  </p>
                </button>
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
            <p className="mt-2 text-xs text-muted-foreground">
              Automations can still mix email and SMS steps. This sets the default audience
              contact method.
            </p>
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
          <CampaignFlowEditor
            nodes={form.flowNodes}
            onChange={(flowNodes) => update("flowNodes", flowNodes)}
            emailsPerDay={form.dripSettings.emailsPerDay ?? 50}
            smsPerDay={form.dripSettings.smsPerDay ?? 50}
            startAt={form.dripSettings.startAt}
            onSettingsChange={(dripSettings) => update("dripSettings", dripSettings)}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => saveDraft()}>
              Save draft
            </Button>
            <Button
              type="button"
              disabled={form.flowNodes.length === 0}
              onClick={() => setStep(4)}
            >
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
              <dd className="font-medium">
                {form.type === "DRIP" ? "Automation" : "Blast"}
              </dd>
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
                <dt className="text-muted-foreground">Automation steps</dt>
                <dd className="font-medium">{form.flowNodes.length}</dd>
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
                {saving ? "Activating..." : "Activate automation"}
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
