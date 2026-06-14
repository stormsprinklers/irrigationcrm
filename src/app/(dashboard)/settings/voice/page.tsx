"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type VoiceOverview = {
  twilioPhone: string | null;
  recordCalls: boolean;
  transcribeCalls: boolean;
  twilioConfigured: boolean;
  counts: { numbers: number; flows: number; groups: number };
  webhooks: Record<string, string>;
};

export default function SettingsVoicePage() {
  const [data, setData] = useState<VoiceOverview | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/voice")
      .then((r) => r.json())
      .then(setData)
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
      }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("Failed to save");
      return;
    }
    setData({ ...data, ...(await res.json()) });
    toast.success("Voice settings saved");
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
          Primary number: {data.twilioPhone ?? "Not set — add in Inbox settings"}
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
            Transcribe calls (Twilio callback)
          </label>
        </div>
        <Button className="mt-4" size="sm" onClick={saveFlags} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </section>

      <section className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
        <p className="font-medium">Twilio Console setup</p>
        <ul className="mt-2 space-y-1 text-muted-foreground">
          <li>TwiML App Voice URL: {appUrl}{data.webhooks.client}</li>
          <li>Tracking number Voice URL: {appUrl}{data.webhooks.inbound}</li>
          <li>Status callback: {appUrl}{data.webhooks.status}</li>
          <li>Recording: {appUrl}{data.webhooks.recording}</li>
          <li>Transcription: {appUrl}{data.webhooks.transcription}</li>
        </ul>
      </section>
    </ContentArea>
  );
}
