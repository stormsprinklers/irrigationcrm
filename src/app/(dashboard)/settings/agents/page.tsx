"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatPhoneDisplay } from "@/lib/inbox/phone";

type ReceptionistSettings = {
  aiReceptionistEnabled: boolean;
  aiReceptionistMaxMinutes: number;
  aiReceptionistSmsConfirm: boolean;
  aiReceptionistTone: string;
  aiReceptionistPolicies: string;
  aiReceptionistKnowledge: string;
  sidebandConfigured: boolean;
};

type ToolLog = {
  id: string;
  tool: string;
  resultCode: string;
  latencyMs: number;
  errorMessage: string | null;
  createdAt: string;
};

type CallLog = {
  id: string;
  status: string;
  fromE164: string;
  toE164: string | null;
  summary: string | null;
  failureReason: string | null;
  startedAt: string;
  endedAt: string | null;
  customer: { id: string; name: string } | null;
  tools: ToolLog[];
};

function actionLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function when(value: string) {
  return new Date(value).toLocaleString();
}

export default function AiReceptionistSettingsPage() {
  const [data, setData] = useState<ReceptionistSettings | null>(null);
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const loadActivity = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const response = await fetch("/api/settings/agents/receptionist/activity");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load activity");
      setCalls(payload.calls || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load activity");
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings/voice").then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load settings");
        return payload;
      }),
      fetch("/api/settings/agents/receptionist/activity").then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load activity");
        return payload;
      }),
    ])
      .then(([settings, activity]) => {
        setData({
          aiReceptionistEnabled: Boolean(settings.aiReceptionistEnabled),
          aiReceptionistMaxMinutes: settings.aiReceptionistMaxMinutes ?? 12,
          aiReceptionistSmsConfirm: settings.aiReceptionistSmsConfirm !== false,
          aiReceptionistTone: settings.aiReceptionistTone ?? "",
          aiReceptionistPolicies: settings.aiReceptionistPolicies ?? "",
          aiReceptionistKnowledge: settings.aiReceptionistKnowledge ?? "",
          sidebandConfigured: Boolean(settings.sidebandConfigured),
        });
        setCalls(activity.calls || []);
      })
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "Failed to load AI receptionist")
      );
  }, []);

  async function save() {
    if (!data) return;
    setSaving(true);
    const response = await fetch("/api/settings/voice", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aiReceptionistEnabled: data.aiReceptionistEnabled,
        aiReceptionistMaxMinutes: data.aiReceptionistMaxMinutes,
        aiReceptionistSmsConfirm: data.aiReceptionistSmsConfirm,
        aiReceptionistTone: data.aiReceptionistTone,
        aiReceptionistPolicies: data.aiReceptionistPolicies,
        aiReceptionistKnowledge: data.aiReceptionistKnowledge,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return toast.error(payload.error || "Failed to save");
    setData((current) => current ? {
      ...current,
      ...payload,
      aiReceptionistTone: payload.aiReceptionistTone ?? "",
      aiReceptionistPolicies: payload.aiReceptionistPolicies ?? "",
      aiReceptionistKnowledge: payload.aiReceptionistKnowledge ?? "",
    } : current);
    toast.success("AI receptionist settings saved");
  }

  if (!data) {
    return <ContentArea><PageHeader breadcrumb={["Settings", "Agents"]} title="AI receptionist" /><p className="text-sm text-muted-foreground">Loading…</p></ContentArea>;
  }

  return (
    <ContentArea className="max-w-4xl">
      <PageHeader
        breadcrumb={["Settings", "Agents"]}
        title="AI receptionist"
        subtitle="Configure the customer-facing voice agent and review everything it has done."
      />

      <section className="mb-6 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Configuration</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sideband worker: {data.sidebandConfigured ? "connected" : "not configured"}
            </p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${data.aiReceptionistEnabled ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"}`}>
            {data.aiReceptionistEnabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        <div className="mt-4 space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={data.aiReceptionistEnabled} onCheckedChange={(checked) => setData({ ...data, aiReceptionistEnabled: checked === true })} />
            Enable AI receptionist
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={data.aiReceptionistSmsConfirm} onCheckedChange={(checked) => setData({ ...data, aiReceptionistSmsConfirm: checked === true })} />
            Send SMS appointment confirmations
          </label>
          <label className="block text-sm font-medium">
            Maximum call minutes
            <input className="mt-1 flex h-10 w-32 rounded-md border border-input bg-background px-3 text-sm" type="number" min={5} max={45} value={data.aiReceptionistMaxMinutes} onChange={(event) => setData({ ...data, aiReceptionistMaxMinutes: Number(event.target.value) || 12 })} />
          </label>
          <label className="block text-sm font-medium">
            Tone / speaking style
            <textarea className="mt-1 min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={data.aiReceptionistTone} onChange={(event) => setData({ ...data, aiReceptionistTone: event.target.value })} placeholder="Friendly and concise. Avoid slang." />
          </label>
          <label className="block text-sm font-medium">
            Company policies
            <textarea className="mt-1 min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={data.aiReceptionistPolicies} onChange={(event) => setData({ ...data, aiReceptionistPolicies: event.target.value })} placeholder="No quotes over the phone. Emergency shutoffs transfer immediately." />
          </label>
          <label className="block text-sm font-medium">
            Knowledge base
            <textarea className="mt-1 min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={data.aiReceptionistKnowledge} onChange={(event) => setData({ ...data, aiReceptionistKnowledge: event.target.value })} placeholder="Service areas, warranty basics, seasonal information, and common questions." />
          </label>
        </div>
        <Button className="mt-4" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Activity log</h2>
            <p className="mt-1 text-sm text-muted-foreground">Recent calls and every CRM tool the receptionist used.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadActivity()} disabled={loadingLogs}>{loadingLogs ? "Refreshing…" : "Refresh"}</Button>
        </div>
        <div className="mt-4 space-y-3">
          {calls.length ? calls.map((call) => (
            <article key={call.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{call.customer?.name || formatPhoneDisplay(call.fromE164) || "Unknown caller"}</p>
                  <p className="text-xs text-muted-foreground">{when(call.startedAt)} · {actionLabel(call.status)}</p>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{call.tools.length} action{call.tools.length === 1 ? "" : "s"}</span>
              </div>
              {call.summary ? <p className="mt-2 text-sm">{call.summary}</p> : null}
              {call.failureReason ? <p className="mt-2 text-sm text-destructive">{call.failureReason}</p> : null}
              {call.tools.length ? (
                <ul className="mt-3 space-y-2 border-t pt-3">
                  {call.tools.map((tool) => (
                    <li key={tool.id} className="flex flex-wrap justify-between gap-2 text-sm">
                      <span>{actionLabel(tool.tool)}{tool.errorMessage ? ` — ${tool.errorMessage}` : ""}</span>
                      <span className={tool.resultCode === "OK" ? "text-green-700" : "text-destructive"}>{tool.resultCode} · {when(tool.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-sm text-muted-foreground">No CRM actions recorded for this call.</p>}
            </article>
          )) : <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No receptionist activity has been recorded yet.</p>}
        </div>
      </section>
    </ContentArea>
  );
}
