"use client";

import { useRef, useState } from "react";
import type { CampaignChannel } from "@prisma/client";
import { toast } from "sonner";
import { CampaignFlowEditor } from "@/components/marketing/CampaignFlowEditor";
import { EmailCampaignEditor } from "@/components/marketing/EmailCampaignEditor";
import { InsertVariableButton, applyTokenToInput } from "@/components/communications/InsertVariableButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  CampaignFlowNodeInput,
  CampaignFormState,
} from "@/lib/marketing/types";

type Props = {
  initial?: Partial<CampaignFormState> & { id?: string; status?: string };
  onSaved: (campaignId: string) => void;
};

function defaultTriggerNode(): CampaignFlowNodeInput {
  return {
    id: "tmp-trigger",
    type: "TRIGGER",
    sortOrder: 0,
    config: {
      kind: "manual_audience",
      priceBookItemIds: [],
      cities: [],
      formNoBookingDays: 7,
    },
  };
}

const defaultForm: CampaignFormState = {
  name: "",
  type: "DRIP",
  channel: "EMAIL",
  subject: "",
  bodyText: "",
  bodyHtml: "",
  aiPrompt: "",
  audienceFilters: {},
  dripSettings: { emailsPerDay: 50, smsPerDay: 50 },
  steps: [],
  flowNodes: [defaultTriggerNode()],
};

export function CampaignWizard({ initial, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CampaignFormState>({
    ...defaultForm,
    ...initial,
    type: initial?.type === "BLAST" ? "BLAST" : "DRIP",
    audienceFilters: initial?.audienceFilters ?? {},
    dripSettings: { ...defaultForm.dripSettings, ...initial?.dripSettings },
    steps: initial?.steps ?? [],
    flowNodes:
      initial?.flowNodes && initial.flowNodes.length > 0
        ? initial.flowNodes
        : initial?.id
          ? initial.flowNodes ?? []
          : [defaultTriggerNode()],
  });
  const campaignId = initial?.id;
  const existingStatus = initial?.status;
  const alreadyLive = existingStatus === "ACTIVE";
  const smsRef = useRef<HTMLTextAreaElement>(null);
  const isBlast = form.type === "BLAST";

  function update<K extends keyof CampaignFormState>(key: K, value: CampaignFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveDraft() {
    if (!form.name.trim()) {
      toast.error("Campaign name is required");
      return null;
    }
    if (isBlast && !form.bodyText.trim() && form.channel === "SMS") {
      toast.error("Message is required");
      return null;
    }
    if (!isBlast && form.flowNodes.length === 0 && form.steps.length === 0) {
      toast.error("Add at least one campaign step");
      return null;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name,
        type: isBlast ? "BLAST" : "DRIP",
        channel: form.channel,
        subject: form.subject || null,
        bodyText: form.bodyText || form.name,
        bodyHtml: form.bodyHtml || null,
        aiPrompt: form.aiPrompt || null,
        audienceFilters: form.audienceFilters,
        dripSettings: isBlast ? null : form.dripSettings,
        steps: isBlast ? undefined : form.steps,
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

      if (!isBlast && form.flowNodes.length > 0) {
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
              (n: {
                id: string;
                type: CampaignFlowNodeInput["type"];
                config: Record<string, unknown>;
                sortOrder: number;
              }) => ({
                id: n.id,
                type: n.type,
                config: (n.config ?? {}) as Record<string, unknown>,
                sortOrder: n.sortOrder,
              })
            )
          );
        }
      } else if (!isBlast && form.steps.length > 0) {
        await fetch(`/api/marketing/campaigns/${id}/steps`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ steps: form.steps }),
        });
      }

      toast.success(campaignId ? "Campaign saved" : "Draft saved");
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
        data.deferredForQuietHours
          ? "Campaign held until 8:00 AM local time (no sends between 9:00 PM and 8:00 AM)"
          : action === "activate"
            ? "Campaign activated"
            : "Campaign sent"
      );
      onSaved(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  if (isBlast) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border bg-amber-50 px-4 py-3 text-sm text-amber-950">
          This is a one-time send created before campaigns used the builder. New campaigns use the
          campaign builder.
        </div>
        <div className="space-y-4 rounded-lg border bg-white p-6">
          <div>
            <label className="text-sm font-medium">Campaign name</label>
            <Input className="mt-1" value={form.name} onChange={(e) => update("name", e.target.value)} />
          </div>
        </div>
        {form.channel === "EMAIL" ? (
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
        ) : (
          <div className="space-y-4 rounded-lg border bg-white p-6">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium">SMS message</label>
              <InsertVariableButton
                onInsert={(token) => {
                  const { next } = applyTokenToInput(smsRef.current, form.bodyText, token);
                  update("bodyText", next);
                }}
              />
            </div>
            <textarea
              ref={smsRef}
              className="mt-1 min-h-[140px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={form.bodyText}
              onChange={(e) => update("bodyText", e.target.value)}
              placeholder="Your SMS message. Reply STOP to opt out will be appended."
            />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={saving} onClick={() => saveDraft()}>
            Save draft
          </Button>
          {alreadyLive ? null : (
            <Button type="button" disabled={saving} onClick={() => finish("send")}>
              {saving ? "Sending..." : "Send now"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-white">
      <div className="flex shrink-0 flex-wrap items-end gap-3 border-b border-border px-4 py-3">
        <div className="min-w-[12rem] flex-1">
          <label className="text-xs font-medium text-muted-foreground">Campaign name</label>
          <Input
            className="mt-1 h-8"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Spring follow-up"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Primary channel</label>
          <div className="mt-1 flex gap-1">
            {(["EMAIL", "SMS"] as CampaignChannel[]).map((channel) => (
              <Button
                key={channel}
                type="button"
                size="sm"
                className="h-8"
                variant={form.channel === channel ? "default" : "outline"}
                onClick={() => update("channel", channel)}
              >
                {channel}
              </Button>
            ))}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => saveDraft()}>
            Save draft
          </Button>
          {alreadyLive ? (
            <Button
              type="button"
              size="sm"
              disabled={saving}
              onClick={async () => {
                const id = (await saveDraft()) ?? campaignId;
                if (id) onSaved(id);
              }}
            >
              {saving ? "Saving..." : "Save changes"}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={saving || form.flowNodes.length === 0}
              onClick={() => finish("activate")}
            >
              {saving ? "Activating..." : "Activate campaign"}
            </Button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <CampaignFlowEditor
          nodes={form.flowNodes}
          onChange={(flowNodes) => update("flowNodes", flowNodes)}
          emailsPerDay={form.dripSettings.emailsPerDay ?? 50}
          smsPerDay={form.dripSettings.smsPerDay ?? 50}
          startAt={form.dripSettings.startAt}
          channel={form.channel}
          audienceFilters={form.audienceFilters}
          onAudienceChange={(audienceFilters) => update("audienceFilters", audienceFilters)}
          onSettingsChange={(dripSettings) => update("dripSettings", dripSettings)}
        />
      </div>
    </div>
  );
}
