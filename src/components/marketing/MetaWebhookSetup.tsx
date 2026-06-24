"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Check, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { MarketingSectionCard } from "@/components/marketing/MarketingMetricGrid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { META_WEBHOOK_FIELDS } from "@/lib/meta/config";

type SocialSettings = {
  callbackUrl: string;
  metaAppId: string | null;
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
  const [metaAppId, setMetaAppId] = useState("");
  const [metaPageId, setMetaPageId] = useState("");
  const [metaInstagramAccountId, setMetaInstagramAccountId] = useState("");
  const [metaAppSecret, setMetaAppSecret] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/marketing/social/settings");
    if (!res.ok) throw new Error("Failed to load");
    const data = (await res.json()) as SocialSettings;
    setSettings(data);
    setVerifyToken(data.verifyToken ?? "");
    setMetaAppId(data.metaAppId ?? "");
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
      setMetaAppId(data.metaAppId ?? "");
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
        description="Connect your Meta app to receive Facebook Page and Instagram messaging events."
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
              Meta Developer Console → your app → Webhooks → Configure. Use this URL for Page and
              Instagram products.
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
        title="App &amp; page routing"
        description="Credentials from Meta App Dashboard → App settings → Basic. Page ID routes events to this company."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <label htmlFor="meta-app-id" className="text-sm font-medium">
              App ID
            </label>
            <Input
              id="meta-app-id"
              value={metaAppId}
              onChange={(e) => setMetaAppId(e.target.value)}
              placeholder="Numeric App ID from Meta"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="meta-page-id" className="text-sm font-medium">
              Facebook Page ID
            </label>
            <Input
              id="meta-page-id"
              value={metaPageId}
              onChange={(e) => setMetaPageId(e.target.value)}
              placeholder="Page ID from Meta Business Suite"
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
              placeholder="Instagram professional account ID"
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
              placeholder={
                settings.hasAppSecret
                  ? `Configured (${settings.appSecretPreview})`
                  : "App Secret from Meta — stored encrypted in CRM"
              }
            />
            <p className="text-xs text-muted-foreground">
              Used to validate webhook signatures. Do not put this in Vercel — save it here only.
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            disabled={saving}
            onClick={() =>
              void save({
                metaAppId,
                metaPageId,
                metaInstagramAccountId,
                ...(metaAppSecret.trim() ? { metaAppSecret: metaAppSecret.trim() } : {}),
              })
            }
          >
            {saving ? "Saving..." : "Save app settings"}
          </Button>
        </div>

        {settings.lastWebhookEvent ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Last event received {format(new Date(settings.lastWebhookEvent.at), "MMM d, yyyy h:mm a")}
            {settings.lastWebhookEvent.field ? ` · ${settings.lastWebhookEvent.field}` : ""}
          </p>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">
            No webhook events received yet. After verification, subscribe to messaging fields below.
          </p>
        )}
      </MarketingSectionCard>

      <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm">
        <p className="font-medium text-foreground">Subscribe to these webhook fields in Meta</p>
        <ul className="mt-3 space-y-3">
          {META_WEBHOOK_FIELDS.map((group) => (
            <li key={group.product}>
              <p className="font-medium text-foreground">{group.product}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {group.fields.map((f) => (
                  <code key={f} className="mr-2 text-[11px]">
                    {f}
                  </code>
                ))}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Environment variables (Vercel)</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <code className="text-xs">NEXT_PUBLIC_APP_URL</code> — required; must match your
            production CRM URL
          </li>
          <li>
            <code className="text-xs">META_APP_ID</code> — optional; pre-fills App ID above if not
            set per company
          </li>
        </ul>
        <p className="mt-3 text-xs">
          Verify token, App Secret, Page ID, and Instagram ID are configured in this CRM (not
          Vercel). See also{" "}
          <Link href="/settings/integrations" className="text-primary underline">
            Settings → Integrations
          </Link>{" "}
          for connection status.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Meta setup checklist</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Set NEXT_PUBLIC_APP_URL in Vercel and redeploy.</li>
          <li>Generate and save a verify token above; copy callback URL and token.</li>
          <li>
            In{" "}
            <a
              href="https://developers.facebook.com/apps/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-primary underline"
            >
              Meta for Developers
              <ExternalLink className="h-3 w-3" />
            </a>
            , open your app → Webhooks → paste URL and token → Verify and Save.
          </li>
          <li>Add Messenger and Instagram products; subscribe to fields listed above.</li>
          <li>Save App ID, App Secret, and Facebook Page ID in this CRM.</li>
          <li>
            DMs will appear in{" "}
            <Link href="/inbox/social/facebook" className="text-primary underline">
              Inbox → Social
            </Link>{" "}
            once message processing is enabled.
          </li>
        </ol>
      </div>
    </div>
  );
}
