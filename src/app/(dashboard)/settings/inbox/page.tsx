"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type InboxSettings = {
  id: string;
  name: string;
  twilioPhone: string | null;
  sendgridFrom: string | null;
  sendgridInboundDomain: string | null;
};

export default function SettingsInboxPage() {
  const [settings, setSettings] = useState<InboxSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/inbox")
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => toast.error("Failed to load inbox settings"));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;

    setSaving(true);
    const res = await fetch("/api/settings/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        twilioPhone: settings.twilioPhone,
        sendgridFrom: settings.sendgridFrom,
        sendgridInboundDomain: settings.sendgridInboundDomain,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      toast.error("Failed to save settings");
      return;
    }

    setSettings(await res.json());
    toast.success("Inbox settings saved");
  }

  if (!settings) {
    return (
      <ContentArea>
        <PageHeader breadcrumb={["Settings", "Inbox"]} title="Inbox" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </ContentArea>
    );
  }

  return (
    <ContentArea className="max-w-2xl">
      <PageHeader
        breadcrumb={["Settings", "Inbox"]}
        title="Inbox"
        subtitle="SMS and email integration"
      />

      <p className="mb-6 text-sm text-muted-foreground">
        Voice dialer, call routing, recording, and transcription are configured in{" "}
        <Link href="/settings/voice" className="text-primary underline">
          Settings → Voice
        </Link>
        .
      </p>

      <form onSubmit={handleSave} className="space-y-6">
        <section className="rounded-lg border border-border bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold">Twilio (SMS & caller ID)</h3>
          <div>
            <label className="mb-1 block text-sm font-medium">Company phone number</label>
            <Input
              value={settings.twilioPhone ?? ""}
              onChange={(e) =>
                setSettings({ ...settings, twilioPhone: e.target.value || null })
              }
              placeholder="+18015550100"
            />
          </div>
        </section>

        <section className="rounded-lg border border-border bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold">SendGrid (Email)</h3>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">From email address</label>
              <Input
                value={settings.sendgridFrom ?? ""}
                onChange={(e) =>
                  setSettings({ ...settings, sendgridFrom: e.target.value || null })
                }
                placeholder="support@stormsprinklers.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Inbound parse domain</label>
              <Input
                value={settings.sendgridInboundDomain ?? ""}
                onChange={(e) =>
                  setSettings({ ...settings, sendgridInboundDomain: e.target.value || null })
                }
                placeholder="parse.stormsprinklers.com"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Webhook URL: {process.env.NEXT_PUBLIC_APP_URL ?? "YOUR_APP_URL"}/api/sendgrid/inbound
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
          <p className="font-medium text-foreground">Twilio webhook URLs</p>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            <li>SMS inbound: /api/twilio/sms/inbound</li>
            <li>Voice inbound: /api/twilio/voice/inbound</li>
            <li>Voice client (TwiML App): /api/twilio/voice/client</li>
            <li>Voice status: /api/twilio/voice/status</li>
          </ul>
        </section>

        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save settings"}
        </Button>
      </form>
    </ContentArea>
  );
}
