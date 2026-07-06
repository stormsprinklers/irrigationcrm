"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, AlertCircle, Circle, XCircle, RefreshCw } from "lucide-react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Credential = {
  id: string;
  type: string;
  label: string;
  keyPrefix: string;
  enabled: boolean;
  lastUsedAt: string | null;
  createdAt: string;
};

type IntegrationUrls = {
  crm: string;
  lms: string;
  design: string;
  website: string;
};

type IntegrationStatusState =
  | "connected"
  | "configured"
  | "not_configured"
  | "error"
  | "disabled";

type IntegrationStatus = {
  type: string;
  label: string;
  status: IntegrationStatusState;
  message: string;
  lastUsedAt: string | null;
  spokeUrl: string | null;
  envHints: string[];
};

type MetaStatus = {
  status: "connected" | "configured" | "not_configured" | "awaiting_verification";
  message: string;
  callbackUrl: string | null;
  webhookVerifiedAt: string | null;
  lastWebhookEventAt: string | null;
  setupUrl: string;
};

const INTEGRATION_TYPES = ["WEBSITE", "LMS", "DESIGN", "MAPS"] as const;

const STATUS_LABELS: Record<IntegrationStatusState, string> = {
  connected: "Connected",
  configured: "Configured",
  not_configured: "Not configured",
  error: "Error",
  disabled: "Disabled",
};

function StatusIcon({ status }: { status: IntegrationStatusState }) {
  switch (status) {
    case "connected":
      return <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />;
    case "configured":
      return <Circle className="h-4 w-4 text-amber-500 shrink-0" />;
    case "error":
      return <XCircle className="h-4 w-4 text-red-600 shrink-0" />;
    case "disabled":
      return <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />;
    default:
      return <Circle className="h-4 w-4 text-muted-foreground shrink-0" />;
  }
}

function statusBadgeVariant(
  status: IntegrationStatusState
): "default" | "secondary" | "destructive" | "outline" | "success" {
  if (status === "connected") return "success";
  if (status === "error") return "destructive";
  return "secondary";
}

type GbpStatus = {
  configured: boolean;
  connected: boolean;
  locationId: string | null;
  locationTitle: string | null;
};

type GoogleAdsStatus = {
  configured: boolean;
  connected: boolean;
  hasDeveloperToken: boolean;
  customerId: string | null;
  customerName: string | null;
};

type MetaAdsStatus = {
  connected: boolean;
  hasToken: boolean;
  adAccountId: string | null;
  adAccountName: string | null;
};

export default function SettingsIntegrationsPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [statuses, setStatuses] = useState<IntegrationStatus[]>([]);
  const [metaStatus, setMetaStatus] = useState<MetaStatus | null>(null);
  const [gbpStatus, setGbpStatus] = useState<GbpStatus | null>(null);
  const [googleAdsStatus, setGoogleAdsStatus] = useState<GoogleAdsStatus | null>(null);
  const [metaAdsStatus, setMetaAdsStatus] = useState<MetaAdsStatus | null>(null);
  const [urls, setUrls] = useState<IntegrationUrls | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [newType, setNewType] = useState<(typeof INTEGRATION_TYPES)[number]>("WEBSITE");
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setCheckingStatus(true);
    try {
      const [statusRes, metaRes, gbpRes, googleAdsRes, metaAdsRes] = await Promise.all([
        fetch("/api/settings/integrations/status"),
        fetch("/api/integrations/meta/status"),
        fetch("/api/marketing/google-business/status"),
        fetch("/api/marketing/google-ads/status"),
        fetch("/api/marketing/meta-ads/status"),
      ]);
      if (!statusRes.ok) throw new Error();
      const data = await statusRes.json();
      setStatuses(data.statuses ?? []);
      if (metaRes.ok) {
        setMetaStatus(await metaRes.json());
      }
      if (gbpRes.ok) {
        setGbpStatus(await gbpRes.json());
      }
      if (googleAdsRes.ok) {
        setGoogleAdsStatus(await googleAdsRes.json());
      }
      if (metaAdsRes.ok) {
        setMetaAdsStatus(await metaAdsRes.json());
      }
    } catch {
      toast.error("Failed to check integration status");
    } finally {
      setCheckingStatus(false);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/integrations");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCredentials(data.credentials);
      setUrls(data.urls);
    } catch {
      toast.error("Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadStatus();
  }, [load, loadStatus]);

  async function createKey() {
    setCreating(true);
    try {
      const res = await fetch("/api/settings/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: newType, label: newLabel || `${newType} key` }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRevealedKey(data.rawKey);
      toast.success("Integration key created — copy it now");
      await load();
      await loadStatus();
      setNewLabel("");
    } catch {
      toast.error("Failed to create key");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this integration key? Spokes using it will stop working.")) return;
    try {
      const res = await fetch(`/api/settings/integrations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Key revoked");
      await load();
      await loadStatus();
    } catch {
      toast.error("Failed to revoke key");
    }
  }

  return (
    <ContentArea className="max-w-3xl">
      <PageHeader
        breadcrumb={["Settings", "Integrations"]}
        title="Integrations"
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={loadStatus}
            disabled={checkingStatus || loading}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${checkingStatus ? "animate-spin" : ""}`} />
            {checkingStatus ? "Checking…" : "Refresh status"}
          </Button>
        }
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-white p-6 space-y-4">
            <div>
              <h2 className="font-medium">Connection status</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Live check for LMS; inbound spokes show status when their API key has been used.
              </p>
            </div>
            {statuses.length === 0 ? (
              <p className="text-sm text-muted-foreground">Checking integrations…</p>
            ) : (
              <ul className="space-y-3">
                {statuses.map((item) => (
                  <li
                    key={item.type}
                    className="rounded-md border border-border p-3 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <StatusIcon status={item.status} />
                        <span className="font-medium text-sm">{item.label}</span>
                      </div>
                      <Badge variant={statusBadgeVariant(item.status)}>
                        {STATUS_LABELS[item.status]}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{item.message}</p>
                    {item.spokeUrl ? (
                      <p className="text-xs font-mono text-muted-foreground break-all">
                        URL: {item.spokeUrl}
                      </p>
                    ) : null}
                    {item.envHints.length > 0 && item.status !== "connected" ? (
                      <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                        {item.envHints.map((hint) => (
                          <li key={hint}>{hint}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {metaStatus ? (
            <div className="rounded-lg border border-border bg-white p-6 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StatusIcon
                    status={
                      metaStatus.status === "connected"
                        ? "connected"
                        : metaStatus.status === "awaiting_verification"
                          ? "configured"
                          : metaStatus.status === "configured"
                            ? "configured"
                            : "not_configured"
                    }
                  />
                  <span className="font-medium text-sm">Meta (Facebook &amp; Instagram)</span>
                </div>
                <Badge
                  variant={
                    metaStatus.status === "connected"
                      ? "success"
                      : metaStatus.status === "not_configured"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {metaStatus.status === "connected"
                    ? "Connected"
                    : metaStatus.status === "awaiting_verification"
                      ? "Awaiting verification"
                      : metaStatus.status === "configured"
                        ? "Configured"
                        : "Not configured"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{metaStatus.message}</p>
              {metaStatus.callbackUrl ? (
                <p className="text-xs font-mono text-muted-foreground break-all">
                  Webhook: {metaStatus.callbackUrl}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="outline" asChild>
                  <Link href={metaStatus.setupUrl}>Configure Meta webhooks</Link>
                </Button>
              </div>
            </div>
          ) : null}

          {gbpStatus ? (
            <div className="rounded-lg border border-border bg-white p-6 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StatusIcon
                    status={
                      gbpStatus.connected && gbpStatus.locationId
                        ? "connected"
                        : gbpStatus.connected || gbpStatus.configured
                          ? "configured"
                          : "not_configured"
                    }
                  />
                  <span className="font-medium text-sm">Google Business Profile</span>
                </div>
                <Badge
                  variant={
                    gbpStatus.connected && gbpStatus.locationId
                      ? "success"
                      : gbpStatus.connected
                        ? "outline"
                        : "secondary"
                  }
                >
                  {gbpStatus.connected && gbpStatus.locationId
                    ? "Connected"
                    : gbpStatus.connected
                      ? "Location needed"
                      : gbpStatus.configured
                        ? "Not connected"
                        : "Not configured"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {!gbpStatus.configured
                  ? "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in Vercel."
                  : !gbpStatus.connected
                    ? "Connect the Google account that manages your Business Profile listing."
                    : !gbpStatus.locationId
                      ? "Choose which location to use for marketing metrics and review tools."
                      : `Using ${gbpStatus.locationTitle ?? "selected location"}.`}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="outline" asChild>
                  <Link href="/settings/integrations/google-business">Configure Google Business Profile</Link>
                </Button>
              </div>
            </div>
          ) : null}

          {googleAdsStatus ? (
            <div className="rounded-lg border border-border bg-white p-6 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StatusIcon
                    status={
                      googleAdsStatus.connected && googleAdsStatus.customerId
                        ? "connected"
                        : googleAdsStatus.connected && googleAdsStatus.hasDeveloperToken
                          ? "configured"
                          : googleAdsStatus.configured
                            ? "configured"
                            : "not_configured"
                    }
                  />
                  <span className="font-medium text-sm">Google Ads</span>
                </div>
                <Badge
                  variant={
                    googleAdsStatus.connected && googleAdsStatus.customerId
                      ? "success"
                      : googleAdsStatus.connected
                        ? "outline"
                        : "secondary"
                  }
                >
                  {googleAdsStatus.connected && googleAdsStatus.customerId
                    ? "Connected"
                    : googleAdsStatus.connected
                      ? "Account needed"
                      : !googleAdsStatus.hasDeveloperToken
                        ? "Developer token needed"
                        : "Not connected"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {!googleAdsStatus.configured
                  ? "Set Google OAuth credentials in Vercel."
                  : !googleAdsStatus.hasDeveloperToken
                    ? "Add GOOGLE_ADS_DEVELOPER_TOKEN in Vercel."
                    : !googleAdsStatus.connected
                      ? "Connect Google Ads for PPC reporting in Marketing → Ads."
                      : !googleAdsStatus.customerId
                        ? "Choose which Google Ads customer account to report on."
                        : `Using ${googleAdsStatus.customerName ?? googleAdsStatus.customerId}.`}
              </p>
              <Button size="sm" variant="outline" asChild>
                <Link href="/settings/integrations/google-ads">Configure Google Ads</Link>
              </Button>
            </div>
          ) : null}

          {metaAdsStatus ? (
            <div className="rounded-lg border border-border bg-white p-6 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StatusIcon
                    status={
                      metaAdsStatus.connected
                        ? "connected"
                        : metaAdsStatus.hasToken
                          ? "configured"
                          : "not_configured"
                    }
                  />
                  <span className="font-medium text-sm">Meta Ads</span>
                </div>
                <Badge variant={metaAdsStatus.connected ? "success" : "secondary"}>
                  {metaAdsStatus.connected
                    ? "Connected"
                    : metaAdsStatus.hasToken
                      ? "Ad account needed"
                      : "Not connected"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {!metaAdsStatus.hasToken
                  ? "Add a Meta User token with ads_read for paid social reporting."
                  : !metaAdsStatus.connected
                    ? "Select the Meta ad account used in Marketing → Ads."
                    : `Using ${metaAdsStatus.adAccountName ?? metaAdsStatus.adAccountId}.`}
              </p>
              <Button size="sm" variant="outline" asChild>
                <Link href="/settings/integrations/meta-ads">Configure Meta Ads</Link>
              </Button>
            </div>
          ) : null}

          {urls && (
            <div className="rounded-lg border border-border bg-white p-6 space-y-2">
              <h2 className="font-medium">Spoke URLs</h2>
              <p className="text-sm text-muted-foreground">
                Configure these in each app&apos;s environment (server-side only for keys).
              </p>
              <dl className="grid gap-2 text-sm mt-3">
                {Object.entries(urls).map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <dt className="w-24 capitalize text-muted-foreground">{key}</dt>
                    <dd className="font-mono text-xs break-all">{value || "—"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {revealedKey && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-2">
              <p className="text-sm font-medium text-amber-900">
                Copy this key now — it won&apos;t be shown again
              </p>
              <code className="block text-xs break-all bg-white p-2 rounded border">{revealedKey}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(revealedKey);
                  toast.success("Copied");
                }}
              >
                Copy to clipboard
              </Button>
            </div>
          )}

          <div className="rounded-lg border border-border bg-white p-6 space-y-4">
            <h2 className="font-medium">API keys</h2>
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="text-xs text-muted-foreground">Type</label>
                <select
                  className="mt-1 block rounded-md border border-input px-3 py-2 text-sm"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as typeof newType)}
                >
                  {INTEGRATION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="text-xs text-muted-foreground">Label</label>
                <Input
                  className="mt-1"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Production website"
                />
              </div>
              <Button onClick={createKey} disabled={creating}>
                {creating ? "Creating..." : "Generate key"}
              </Button>
            </div>

            {credentials.length === 0 ? (
              <p className="text-sm text-muted-foreground">No integration keys yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {credentials.map((c) => (
                  <li key={c.id} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{c.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.type} · {c.keyPrefix}… · {c.enabled ? "Active" : "Disabled"}
                        {c.lastUsedAt &&
                          ` · Last used ${new Date(c.lastUsedAt).toLocaleString()}`}
                      </p>
                    </div>
                    <Button size="sm" variant="destructive" onClick={() => revoke(c.id)}>
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-border bg-white p-6 text-sm text-muted-foreground space-y-2">
            <h2 className="font-medium text-foreground">Environment variables (spokes)</h2>
            <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">{`# Website / Design → CRM
CRM_INTEGRATION_URL=https://your-crm.example.com/api/integrations
CRM_INTEGRATION_KEY=crm_int_...

# CRM → LMS (shared secret, not a crm_int key)
LMS_INTEGRATION_URL=https://your-lms.example.com
LMS_INTEGRATION_KEY=same-as-lms-INTEGRATION_API_KEY

# Meta (Facebook / Instagram) — Vercel on CRM only
NEXT_PUBLIC_APP_URL=https://your-crm.example.com
META_APP_ID=optional-default-app-id
# Webhook: {NEXT_PUBLIC_APP_URL}/api/meta/webhook
# App Secret, verify token, Page ID → Settings → Meta webhooks in CRM`}</pre>
          </div>
        </div>
      )}
    </ContentArea>
  );
}
