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
  emailAuth?: {
    configured: boolean;
    authSource: string | null;
    usernamePreview: string | null;
    fromEmail: string | null;
    issues: string[];
  };
};

export default function SettingsInboxPage() {
  const [settings, setSettings] = useState<InboxSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testingEmail, setTestingEmail] = useState(false);

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

  async function sendTestEmail() {
    if (!testTo.trim()) {
      toast.error("Enter a recipient email");
      return;
    }

    setTestingEmail(true);
    try {
      const res = await fetch("/api/settings/inbox/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testTo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Test email failed");
        return;
      }
      toast.success(`Test email sent to ${data.to}`);
    } finally {
      setTestingEmail(false);
    }
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
          <h3 className="mb-4 text-lg font-semibold">Twilio Email</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Outbound email uses Twilio Email API credentials from Vercel. Set{" "}
            <code className="text-xs">TWILIO_ACCOUNT_SID</code> +{" "}
            <code className="text-xs">TWILIO_AUTH_TOKEN</code>, or dedicated{" "}
            <code className="text-xs">TWILIO_EMAIL_API_KEY</code> +{" "}
            <code className="text-xs">TWILIO_EMAIL_API_SECRET</code>. Override the From address below
            per company, or set <code className="text-xs">TWILIO_FROM_EMAIL</code> globally. Sender display
            name and logo are configured in{" "}
            <Link href="/settings/company" className="text-primary underline">
              Settings → Company → Email branding
            </Link>
            .
          </p>
          {settings.emailAuth ? (
            <div
              className={`mb-4 rounded-md border p-3 text-sm ${
                settings.emailAuth.configured
                  ? "border-green-200 bg-green-50 text-green-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              {settings.emailAuth.configured ? (
                <p>
                  Email auth ready ({settings.emailAuth.authSource}
                  {settings.emailAuth.usernamePreview ? ` · ${settings.emailAuth.usernamePreview}` : ""}
                  ).
                </p>
              ) : (
                <ul className="list-disc space-y-1 pl-5">
                  {settings.emailAuth.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
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
              <label className="mb-1 block text-sm font-medium">Inbound parse domain (optional)</label>
              <Input
                value={settings.sendgridInboundDomain ?? ""}
                onChange={(e) =>
                  setSettings({ ...settings, sendgridInboundDomain: e.target.value || null })
                }
                placeholder="parse.stormsprinklers.com"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Inbound webhook: {process.env.NEXT_PUBLIC_APP_URL ?? "YOUR_APP_URL"}/api/sendgrid/inbound
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Campaign events: {process.env.NEXT_PUBLIC_APP_URL ?? "YOUR_APP_URL"}/api/sendgrid/events
              </p>
            </div>
            <div className="rounded-md border border-dashed p-4">
              <p className="text-sm font-medium">Send test email</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Verifies Twilio credentials and sender authentication.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Input
                  type="email"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="you@example.com"
                  className="max-w-xs"
                />
                <Button type="button" variant="outline" disabled={testingEmail} onClick={sendTestEmail}>
                  {testingEmail ? "Sending..." : "Send test"}
                </Button>
              </div>
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
