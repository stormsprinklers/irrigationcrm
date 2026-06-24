"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Check, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { MarketingSectionCard } from "@/components/marketing/MarketingMetricGrid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SocialSettings = {
  callbackUrl: string;
  verifyToken: string | null;
  verifyTokenPreview: string | null;
  hasVerifyToken: boolean;
  metaPageId: string | null;
  metaInstagramAccountId: string | null;
  hasAppSecret: boolean;
  appSecretPreview: string | null;
  webhookVerifiedAt: string | null;
  lastWebhookEvent: { at: string; object: string | null; field: string | null } | null;
};

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error(`Could not copy ${label.toLowerCase()}`);
  }
}

export function MetaWebhookSetup() {
  const [settings, setSettings] = useState<SocialSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifyToken, setVerifyToken] = useState("");
  const [metaPageId, setMetaPageId] = useState("");
  const [metaInstagramAccountId, setMetaInstagramAccountId] = useState("");
  const [metaAppSecret, setMetaAppSecret] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/marketing/social/settings");
    if (!res.ok) throw new Error("Failed to load");
    const data = (await res.json()) as SocialSettings;
    setSettings(data);
    setVerifyToken(data.verifyToken ?? "");
    setMetaPageId(data.metaPageId ?? "");
    setMetaInstagramAccountId(data.metaInstagramAccountId ?? "");
    setMetaAppSecret("");
  }, []);

  useEffect(() => {
    load()
      .catch(() => toast.error("Failed to load Meta webhook settings"))
      .finally(() => setLoading(false));
  }, [load]);

  async function save(fields: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch("/api/marketing/social/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSettings((prev) => (prev ? { ...prev, ...data } : data));
      setVerifyToken(data.verifyToken ?? "");
      setMetaPageId(data.metaPageId ?? "");
      setMetaInstagramAccountId(data.metaInstagramAccountId ?? "");
      setMetaAppSecret("");
      toast.success("Saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading webhook settings...</p>;
  }

  if (!settings) return null;

  const verified = Boolean(settings.webhookVerifiedAt);

  return (
    <div className="space-y-6">
      <MarketingSectionCard
        title="Meta webhook connection"
        description="Use these values in the Meta App Dashboard → Webhooks to receive Facebook Page, Instagram, and messaging events."
        action={
          verified ? (
            <Badge className="bg-green-600 hover:bg-green-600">Verified</Badge>
          ) : settings.hasVerifyToken ? (
            <Badge variant="secondary">Awaiting verification</Badge>
          ) : (
            <Badge variant="outline">Not configured</Badge>
          )
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="meta-callback-url" className="text-sm font-medium">
              Callback URL
            </label>
            <div className="flex gap-2">
              <Input id="meta-callback-url" readOnly value={settings.callbackUrl} className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => void copyText(settings.callbackUrl, "Callback URL")}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Paste this as the Callback URL in Meta for your app (same URL for Facebook and Instagram
              products).
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="meta-verify-token" className="text-sm font-medium">
              Verify token
            </label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="meta-verify-token"
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                placeholder="Generate or enter a secret token"
                className="min-w-[220px] flex-1 font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => void save({ regenerateVerifyToken: true })}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Generate
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={!verifyToken}
                onClick={() => void copyText(verifyToken, "Verify token")}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving || !verifyToken.trim()}
                onClick={() => void save({ verifyToken })}
              >
                Save token
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter the same value in Meta under Verify Token when subscribing to webhook fields.
            </p>
          </div>

          {settings.webhookVerifiedAt ? (
            <p className="flex items-center gap-1.5 text-xs text-green-700">
              <Check className="h-3.5 w-3.5" />
              Meta verified this webhook on{" "}
              {format(new Date(settings.webhookVerifiedAt), "MMM d, yyyy h:mm a")}
            </p>
          ) : null}
        </div>
      </MarketingSectionCard>

      <MarketingSectionCard
        title="Routing &amp; security"
        description="Page ID routes incoming events to your company. App Secret validates webhook signatures."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="meta-page-id" className="text-sm font-medium">
              Facebook Page ID
            </label>
            <Input
              id="meta-page-id"
              value={metaPageId}
              onChange={(e) => setMetaPageId(e.target.value)}
              placeholder="Page ID from Meta"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="meta-ig-id" className="text-sm font-medium">
              Instagram account ID
            </label>
            <Input
              id="meta-ig-id"
              value={metaInstagramAccountId}
              onChange={(e) => setMetaInstagramAccountId(e.target.value)}
              placeholder="Optional — for Instagram webhooks"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <label htmlFor="meta-app-secret" className="text-sm font-medium">
              App Secret
            </label>
            <Input
              id="meta-app-secret"
              type="password"
              value={metaAppSecret}
              onChange={(e) => setMetaAppSecret(e.target.value)}
              placeholder={settings.hasAppSecret ? `Configured (${settings.appSecretPreview})` : "From Meta App Dashboard"}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            disabled={saving}
            onClick={() =>
              void save({
                metaPageId,
                metaInstagramAccountId,
                ...(metaAppSecret.trim() ? { metaAppSecret: metaAppSecret.trim() } : {}),
              })
            }
          >
            {saving ? "Saving..." : "Save routing settings"}
          </Button>
        </div>

        {settings.lastWebhookEvent ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Last event received {format(new Date(settings.lastWebhookEvent.at), "MMM d, yyyy h:mm a")}
            {settings.lastWebhookEvent.field ? ` · ${settings.lastWebhookEvent.field}` : ""}
          </p>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">
            No webhook events received yet. After Meta verifies the URL, subscribe to fields (e.g.{" "}
            <code className="text-[11px]">messages</code>, <code className="text-[11px]">feed</code>
            ).
          </p>
        )}
      </MarketingSectionCard>

      <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Meta setup checklist</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Generate and save a verify token above, then copy the callback URL and token.</li>
          <li>
            In{" "}
            <a
              href="https://developers.facebook.com/apps/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Meta for Developers
            </a>
            , open your app → Webhooks → Configure.
          </li>
          <li>Paste the callback URL and verify token, then click Verify and Save.</li>
          <li>Subscribe to Page and Instagram fields you need (messages, feed, etc.).</li>
          <li>Enter your Facebook Page ID so events route to this CRM account.</li>
        </ol>
      </div>
    </div>
  );
}
