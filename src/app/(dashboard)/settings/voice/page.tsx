"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RequiredClipPicker } from "@/components/voice/RequiredClipPicker";
import type { VoiceClip } from "@/components/voice/AudioSourcePicker";

type VoiceOverview = {
  twilioPhone: string | null;
  recordCalls: boolean;
  transcribeCalls: boolean;
  skipIvrForKnownCustomers: boolean;
  queueWaitClipId: string | null;
  holdMusicClipId: string | null;
  aiReceptionistEnabled: boolean;
  aiReceptionistMaxMinutes: number;
  aiReceptionistSmsConfirm: boolean;
  aiReceptionistTone: string;
  aiReceptionistPolicies: string;
  aiReceptionistKnowledge: string;
  twilioConfigured: boolean;
  sidebandConfigured: boolean;
  clips: VoiceClip[];
  counts: { numbers: number; flows: number; groups: number };
  webhooks: Record<string, string>;
};

export default function SettingsVoicePage() {
  const [data, setData] = useState<VoiceOverview | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingAudio, setSavingAudio] = useState(false);

  useEffect(() => {
    fetch("/api/settings/voice")
      .then((r) => r.json())
      .then((payload) =>
        setData({
          ...payload,
          skipIvrForKnownCustomers: payload.skipIvrForKnownCustomers !== false,
          queueWaitClipId: payload.queueWaitClipId ?? null,
          holdMusicClipId: payload.holdMusicClipId ?? null,
          aiReceptionistEnabled: Boolean(payload.aiReceptionistEnabled),
          aiReceptionistMaxMinutes: payload.aiReceptionistMaxMinutes ?? 12,
          aiReceptionistSmsConfirm: payload.aiReceptionistSmsConfirm !== false,
          aiReceptionistTone: payload.aiReceptionistTone ?? "",
          aiReceptionistPolicies: payload.aiReceptionistPolicies ?? "",
          aiReceptionistKnowledge: payload.aiReceptionistKnowledge ?? "",
          sidebandConfigured: Boolean(payload.sidebandConfigured),
          clips: Array.isArray(payload.clips) ? payload.clips : [],
        })
      )
      .catch(() => toast.error("Failed to load voice settings"));
  }, []);

  async function saveFlags() {
    if (!data) return;
    setSaving(true);
    const res = await fetch("/api/settings/voice", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recordCalls: data.recordCalls,
        transcribeCalls: data.transcribeCalls,
        skipIvrForKnownCustomers: data.skipIvrForKnownCustomers,
        aiReceptionistEnabled: data.aiReceptionistEnabled,
        aiReceptionistMaxMinutes: data.aiReceptionistMaxMinutes,
        aiReceptionistSmsConfirm: data.aiReceptionistSmsConfirm,
        aiReceptionistTone: data.aiReceptionistTone,
        aiReceptionistPolicies: data.aiReceptionistPolicies,
        aiReceptionistKnowledge: data.aiReceptionistKnowledge,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("Failed to save");
      return;
    }
    const updated = await res.json();
    setData({
      ...data,
      ...updated,
      aiReceptionistTone: updated.aiReceptionistTone ?? "",
      aiReceptionistPolicies: updated.aiReceptionistPolicies ?? "",
      aiReceptionistKnowledge: updated.aiReceptionistKnowledge ?? "",
    });
    toast.success("Voice settings saved");
  }

  async function saveQueueHoldAudio() {
    if (!data) return;
    if (!data.queueWaitClipId || !data.holdMusicClipId) {
      toast.error("Upload and select audio clips for both queue wait and hold music");
      return;
    }
    setSavingAudio(true);
    const res = await fetch("/api/settings/voice", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queueWaitClipId: data.queueWaitClipId,
        holdMusicClipId: data.holdMusicClipId,
        requireQueueHoldClips: true,
      }),
    });
    setSavingAudio(false);
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast.error(err?.error ?? "Failed to save queue & hold audio");
      return;
    }
    const updated = await res.json();
    setData({
      ...data,
      queueWaitClipId: updated.queueWaitClipId ?? data.queueWaitClipId,
      holdMusicClipId: updated.holdMusicClipId ?? data.holdMusicClipId,
    });
    toast.success("Queue & hold audio saved");
  }

  if (!data) {
    return (
      <ContentArea>
        <PageHeader breadcrumb={["Settings", "Voice"]} title="Voice" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </ContentArea>
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const audioReady = Boolean(data.queueWaitClipId && data.holdMusicClipId);

  return (
    <ContentArea className="max-w-2xl">
      <PageHeader
        breadcrumb={["Settings", "Voice"]}
        title="Voice"
        subtitle="Browser softphone, call routing, and Twilio webhooks"
      />

      <section className="mb-6 rounded-lg border border-border bg-white p-6">
        <h3 className="mb-2 text-lg font-semibold">Connection status</h3>
        <p className="text-sm text-muted-foreground">
          Twilio SDK: {data.twilioConfigured ? "Configured" : "Missing env vars"}
        </p>
        <p className="text-sm text-muted-foreground">
          Primary caller ID: {data.twilioPhone ?? "Not set — mark a number as primary under Phone numbers"}
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <Link href="/settings/voice/numbers" className="text-primary underline">
            {data.counts.numbers} phone numbers
          </Link>
          <Link href="/settings/voice/flows" className="text-primary underline">
            {data.counts.flows} call flows
          </Link>
          <Link href="/settings/voice/groups" className="text-primary underline">
            {data.counts.groups} agent groups
          </Link>
        </div>
      </section>

      <section className="mb-6 rounded-lg border border-border bg-white p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Queue & hold audio</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Both clips are required. Queue wait music plays for callers waiting for an agent; hold
              music plays when a CSR puts a live call on hold.
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              audioReady ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"
            }`}
          >
            {audioReady ? "Configured" : "Required"}
          </span>
        </div>

        <div className="space-y-6">
          <RequiredClipPicker
            label="Queue wait music"
            description="Looped while the caller is in the company queue."
            clipId={data.queueWaitClipId}
            clips={data.clips}
            onChange={(id) => setData({ ...data, queueWaitClipId: id })}
            onClipsChange={(clips) => setData({ ...data, clips })}
          />
          <RequiredClipPicker
            label="Hold music"
            description="Looped when an agent places the customer on hold."
            clipId={data.holdMusicClipId}
            clips={data.clips}
            onChange={(id) => setData({ ...data, holdMusicClipId: id })}
            onClipsChange={(clips) => setData({ ...data, clips })}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={() => void saveQueueHoldAudio()} disabled={savingAudio}>
            {savingAudio ? "Saving…" : "Save queue & hold audio"}
          </Button>
          <Link href="/settings/voice/clips" className="text-sm text-primary underline">
            Manage audio clip library
          </Link>
        </div>
      </section>

      <section className="mb-6 rounded-lg border border-border bg-white p-6">
        <h3 className="mb-4 text-lg font-semibold">Recording & transcription</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={data.recordCalls}
              onCheckedChange={(c) => setData({ ...data, recordCalls: Boolean(c) })}
            />
            Record calls
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={data.transcribeCalls}
              onCheckedChange={(c) => setData({ ...data, transcribeCalls: Boolean(c) })}
            />
            Transcribe calls (Whisper after recording)
          </label>
        </div>
        <Button className="mt-4" size="sm" onClick={saveFlags} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </section>

      <section className="mb-6 rounded-lg border border-border bg-white p-6">
        <h3 className="mb-2 text-lg font-semibold">AI receptionist</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Enables the AI receptionist step in call flows. Requires a sideband worker (
          <code className="text-xs">SIDEBAND_PUBLIC_WSS_URL</code>) and{" "}
          <code className="text-xs">OPENAI_API_KEY</code> /{" "}
          <code className="text-xs">AI_RECEPTIONIST_SECRET</code>. Sideband:{" "}
          {data.sidebandConfigured ? "URL configured" : "not configured"}.
        </p>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={data.aiReceptionistEnabled}
              onCheckedChange={(c) => setData({ ...data, aiReceptionistEnabled: Boolean(c) })}
            />
            Enable AI receptionist
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={data.aiReceptionistSmsConfirm}
              onCheckedChange={(c) => setData({ ...data, aiReceptionistSmsConfirm: Boolean(c) })}
            />
            Send SMS appointment confirmations
          </label>
          <div>
            <label className="mb-1 block text-sm font-medium">Default max call minutes</label>
            <input
              type="number"
              min={5}
              max={45}
              className="flex h-10 w-32 rounded-md border border-input bg-background px-3 text-sm"
              value={data.aiReceptionistMaxMinutes}
              onChange={(e) =>
                setData({
                  ...data,
                  aiReceptionistMaxMinutes: Number(e.target.value) || 12,
                })
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Tone / speaking style</label>
            <textarea
              className="min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="e.g. Friendly and concise. Avoid slang. Say Storm Sprinklers clearly."
              value={data.aiReceptionistTone}
              onChange={(e) => setData({ ...data, aiReceptionistTone: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Company policies</label>
            <textarea
              className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="e.g. No quotes over the phone. Emergency shutoffs transfer immediately. Same-day only if a tech is free."
              value={data.aiReceptionistPolicies}
              onChange={(e) => setData({ ...data, aiReceptionistPolicies: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Knowledge base</label>
            <textarea
              className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Service area notes, winterization season, warranty basics, office hours, common FAQs…"
              value={data.aiReceptionistKnowledge}
              onChange={(e) => setData({ ...data, aiReceptionistKnowledge: e.target.value })}
            />
          </div>
        </div>
        <Button className="mt-4" size="sm" onClick={saveFlags} disabled={saving}>
          {saving ? "Saving..." : "Save AI settings"}
        </Button>
      </section>

      <section className="mb-6 rounded-lg border border-border bg-white p-6">
        <h3 className="mb-2 text-lg font-semibold">Spam reduction IVR</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Call flows that start with a phone menu (e.g. “press 1 to continue”) block robocalls.
          Known customers can skip that menu and ring your CSRs directly.
        </p>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            className="mt-0.5"
            checked={data.skipIvrForKnownCustomers !== false}
            onCheckedChange={(c) =>
              setData({ ...data, skipIvrForKnownCustomers: Boolean(c) })
            }
          />
          <span>
            Skip entry IVR for existing customers
            <span className="mt-0.5 block text-xs text-muted-foreground">
              On by default. New or unknown callers still hear the menu.
            </span>
          </span>
        </label>
        <Button className="mt-4" size="sm" onClick={saveFlags} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </section>

      <section className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
        <p className="font-medium">Twilio Console setup</p>
        <ul className="mt-2 space-y-1 text-muted-foreground">
          <li>TwiML App Voice URL: {appUrl}{data.webhooks.voiceClient}</li>
          <li>Number Voice URL: {appUrl}{data.webhooks.voiceInbound}</li>
          <li>Status callback: {appUrl}{data.webhooks.voiceStatus}</li>
          <li>Recording: {appUrl}{data.webhooks.voiceRecording}</li>
          <li>Transcription: {appUrl}{data.webhooks.voiceTranscription}</li>
          <li>SMS inbound: {appUrl}{data.webhooks.smsInbound}</li>
          <li>SMS status: {appUrl}{data.webhooks.smsStatus}</li>
          <li>Email inbound: {appUrl}{data.webhooks.emailInbound}</li>
          <li>Email events: {appUrl}{data.webhooks.emailEvents}</li>
        </ul>
      </section>
    </ContentArea>
  );
}
