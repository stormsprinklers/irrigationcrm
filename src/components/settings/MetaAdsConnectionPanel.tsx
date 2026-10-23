"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Loader2, Megaphone, RefreshCw, Unplug } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { MetaAdAccount, MetaAdsConnectionStatus } from "@/lib/meta/ads";

type MetaAdsSettings = {
  hasDedicatedToken: boolean;
  dedicatedTokenPreview: string | null;
  hasFallbackToken: boolean;
  fallbackTokenPreview: string | null;
  adAccountId: string | null;
  adAccountName: string | null;
  conversionsReady: boolean;
  conversionsTokenPreview: string | null;
  conversionsDatasetId: string | null;
  conversionsTestEventCode: string | null;
  conversionsConfiguredAt: string | null;
};

type ConversionTestResult = {
  requestId: string | null;
  metadata: {
    eventsReceived: number;
    datasetId: string;
    eventName: string;
    eventId: string;
    actionSource: string;
    testMode: boolean;
    testEventCode: string | null;
  };
};

export function MetaAdsConnectionPanel() {
  const [status, setStatus] = useState<MetaAdsConnectionStatus | null>(null);
  const [settings, setSettings] = useState<MetaAdsSettings | null>(null);
  const [accounts, setAccounts] = useState<MetaAdAccount[]>([]);
  const [accessToken, setAccessToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingConversions, setSavingConversions] = useState(false);
  const [testingConversions, setTestingConversions] = useState(false);
  const [conversionTestResult, setConversionTestResult] = useState<ConversionTestResult | null>(null);
  const [conversionsAccessToken, setConversionsAccessToken] = useState("");
  const [conversionsDatasetId, setConversionsDatasetId] = useState("");
  const [conversionsTestEventCode, setConversionsTestEventCode] = useState("");

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/marketing/meta-ads/status");
    if (res.ok) setStatus(await res.json());
  }, []);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/marketing/meta-ads/settings");
    if (res.ok) {
      const data = (await res.json()) as MetaAdsSettings;
      setSettings(data);
      setConversionsDatasetId(data.conversionsDatasetId ?? "");
      setConversionsTestEventCode(data.conversionsTestEventCode ?? "");
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const res = await fetch("/api/marketing/meta-ads/accounts");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load ad accounts");
      setAccounts(data.accounts ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load ad accounts");
      setAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([loadStatus(), loadSettings()])
      .catch(() => toast.error("Failed to load Meta Ads settings"))
      .finally(() => setLoading(false));
  }, [loadStatus, loadSettings]);

  useEffect(() => {
    if (!status?.hasToken) return;
    void loadAccounts();
  }, [status?.hasToken, loadAccounts]);

  async function saveToken() {
    if (!accessToken.trim()) {
      toast.error("Paste a Meta User access token with ads_read");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/marketing/meta-ads/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metaAdsAccessToken: accessToken.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save token");
      setAccessToken("");
      setSettings(data);
      await loadStatus();
      await loadAccounts();
      toast.success("Meta Ads token saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save token");
    } finally {
      setSaving(false);
    }
  }

  async function saveAccount(account: MetaAdAccount) {
    setSavingAccount(true);
    try {
      const res = await fetch("/api/marketing/meta-ads/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adAccountId: account.accountId,
          adAccountName: account.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save ad account");
      setSettings(data);
      await loadStatus();
      toast.success("Meta ad account saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save ad account");
    } finally {
      setSavingAccount(false);
    }
  }

  async function saveConversions() {
    if (!conversionsAccessToken.trim() && !settings?.conversionsTokenPreview) {
      toast.error("Paste a Meta Conversions API access token");
      return;
    }
    if (!conversionsDatasetId.replace(/\D/g, "")) {
      toast.error("Enter the Meta dataset or pixel ID");
      return;
    }
    setSavingConversions(true);
    try {
      const res = await fetch("/api/marketing/meta-ads/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(conversionsAccessToken.trim()
            ? { metaConversionsAccessToken: conversionsAccessToken.trim() }
            : {}),
          metaConversionsDatasetId: conversionsDatasetId,
          metaConversionsTestEventCode: conversionsTestEventCode,
        }),
      });
      const data = (await res.json()) as MetaAdsSettings & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save Meta Conversions API settings");
      setConversionsAccessToken("");
      setSettings(data);
      toast.success("Meta pipeline conversions are ready");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save conversions settings");
    } finally {
      setSavingConversions(false);
    }
  }

  async function sendConversionsTest() {
    setTestingConversions(true);
    setConversionTestResult(null);
    try {
      const res = await fetch("/api/marketing/meta-ads/conversions/test", { method: "POST" });
      const data = (await res.json()) as ConversionTestResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Meta test event failed");
      setConversionTestResult(data);
      toast.success("Meta accepted the diagnostic test event");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Meta test event failed", {
        duration: 10000,
      });
    } finally {
      setTestingConversions(false);
    }
  }

  async function disconnect() {
    const res = await fetch("/api/marketing/meta-ads/settings", { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to disconnect");
      return;
    }
    setAccounts([]);
    setSettings(null);
    await loadStatus();
    toast.success("Meta Ads disconnected");
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading Meta Ads...</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-5 w-5" />
            Meta Ads access token
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Paid ads reporting needs a Meta <strong>User</strong> access token with{" "}
            <code className="text-xs">ads_read</code>. Generate one in{" "}
            <a
              href="https://developers.facebook.com/tools/explorer/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Graph API Explorer
            </a>{" "}
            or reuse your Meta webhooks token if it includes ads permissions.
          </p>
          {settings?.hasDedicatedToken ? (
            <p className="text-xs text-muted-foreground">
              Dedicated ads token saved: {settings.dedicatedTokenPreview}
            </p>
          ) : settings?.hasFallbackToken ? (
            <p className="text-xs text-muted-foreground">
              Using token from Meta webhooks: {settings.fallbackTokenPreview}
            </p>
          ) : (
            <p className="text-xs text-amber-700">
              No token yet. Configure{" "}
              <Link href="/settings/integrations/meta" className="underline">
                Meta webhooks
              </Link>{" "}
              or paste an ads token below.
            </p>
          )}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Meta User token (ads_read)
            </label>
            <Input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="Paste access token"
            />
          </div>
          <Button size="sm" disabled={saving} onClick={() => void saveToken()}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Save token
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Meta Conversions API</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Sends Lead, QualifiedLead, ConvertedLead, and Purchase from the CRM.
            </p>
          </div>
          <Badge variant={settings?.conversionsReady ? "success" : "outline"}>
            {settings?.conversionsReady ? "Ready" : "Setup needed"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            In Meta Events Manager, choose the dataset used by your ad account and generate a
            Conversions API access token. The reporting token above is kept separate.
          </p>
          {settings?.conversionsTokenPreview ? (
            <p className="text-xs text-muted-foreground">
              Saved CAPI token: {settings.conversionsTokenPreview}
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Dataset / pixel ID</label>
              <Input
                inputMode="numeric"
                value={conversionsDatasetId}
                onChange={(event) => setConversionsDatasetId(event.target.value)}
                placeholder="123456789012345"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Test event code (optional)
              </label>
              <Input
                value={conversionsTestEventCode}
                onChange={(event) => setConversionsTestEventCode(event.target.value)}
                placeholder="TEST12345"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Conversions API access token
            </label>
            <Input
              type="password"
              value={conversionsAccessToken}
              onChange={(event) => setConversionsAccessToken(event.target.value)}
              placeholder={settings?.conversionsTokenPreview ? "Leave blank to keep saved token" : "Paste token"}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Google click IDs are not sent to Meta. Meta receives hashed email/phone plus fbc, fbp,
            and browser user agent when available.
          </p>
          <Button size="sm" disabled={savingConversions} onClick={() => void saveConversions()}>
            {savingConversions ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Save Conversions API
          </Button>
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-xs text-muted-foreground">
              Send a diagnostic Lead directly to Meta with the saved dataset and test event code.
              This bypasses the pipeline queue and scheduled worker.
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={
                testingConversions ||
                !settings?.conversionsReady ||
                !settings.conversionsTestEventCode
              }
              onClick={() => void sendConversionsTest()}
            >
              {testingConversions ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Send Meta test event
            </Button>
            {conversionTestResult ? (
              <div className="space-y-1 break-all text-xs text-muted-foreground">
                <p>
                  Accepted {conversionTestResult.metadata.eventsReceived} event · test mode{" "}
                  {conversionTestResult.metadata.testMode ? "on" : "off"}
                </p>
                <p>Dataset: {conversionTestResult.metadata.datasetId}</p>
                <p>Test code: {conversionTestResult.metadata.testEventCode ?? "none"}</p>
                <p>Event ID: {conversionTestResult.metadata.eventId}</p>
                <p>Meta trace ID: {conversionTestResult.requestId ?? "not returned"}</p>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {status?.hasToken ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Ad account</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {status.adAccountName ?? "Select the ad account used in Marketing → Ads"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {status.connected ? <Badge variant="secondary">Ready</Badge> : null}
              {status.connectedAt ? (
                <span className="text-xs text-muted-foreground">
                  Since {format(new Date(status.connectedAt), "MMM d, yyyy")}
                </span>
              ) : null}
              <Button variant="outline" size="sm" onClick={() => void disconnect()}>
                <Unplug className="mr-1 h-4 w-4" />
                Clear ads link
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Accessible ad accounts</p>
              <Button
                size="sm"
                variant="outline"
                disabled={loadingAccounts}
                onClick={() => void loadAccounts()}
              >
                <RefreshCw className={`mr-1 h-4 w-4 ${loadingAccounts ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
            {loadingAccounts ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading ad accounts...
              </div>
            ) : accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No ad accounts returned. Confirm the token has ads_read and business_management.
              </p>
            ) : (
              accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div>
                    <p className="font-medium">{account.name}</p>
                    <p className="text-sm text-muted-foreground">
                      act_{account.accountId}
                      {account.currency ? ` · ${account.currency}` : ""}
                      {account.status ? ` · ${account.status}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={status.adAccountId === account.accountId ? "default" : "outline"}
                    disabled={savingAccount}
                    onClick={() => void saveAccount(account)}
                  >
                    {status.adAccountId === account.accountId ? "Selected" : "Use this account"}
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
