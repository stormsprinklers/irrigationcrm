"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { Globe, Loader2, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type {
  GbpAccount,
  GbpConnectionStatus,
  GbpLocation,
  GbpPerformanceSummary,
} from "@/lib/google-business/types";

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function GoogleBusinessProfilePanel() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<GbpConnectionStatus | null>(null);
  const [accounts, setAccounts] = useState<GbpAccount[]>([]);
  const [locations, setLocations] = useState<GbpLocation[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [performance, setPerformance] = useState<GbpPerformanceSummary | null>(null);
  const [days, setDays] = useState(28);
  const [loading, setLoading] = useState(true);
  const [loadingPerformance, setLoadingPerformance] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthClientSecret, setOauthClientSecret] = useState("");
  const [savingCredentials, setSavingCredentials] = useState(false);

  const redirectUri =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/marketing/google-business/callback`
      : "/api/marketing/google-business/callback";

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/marketing/google-business/status");
    if (res.ok) setStatus(await res.json());
  }, []);

  const loadAccounts = useCallback(async () => {
    const res = await fetch("/api/marketing/google-business/accounts");
    if (!res.ok) return;
    const data = await res.json();
    setAccounts(data.accounts ?? []);
  }, []);

  const loadLocations = useCallback(async (accountId: string) => {
    const res = await fetch(
      `/api/marketing/google-business/locations?accountId=${encodeURIComponent(accountId)}`
    );
    if (!res.ok) return;
    const data = await res.json();
    setLocations(data.locations ?? []);
  }, []);

  const loadPerformance = useCallback(async (rangeDays: number) => {
    setLoadingPerformance(true);
    try {
      const res = await fetch(`/api/marketing/google-business/performance?days=${rangeDays}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load performance");
      setPerformance(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load performance");
      setPerformance(null);
    } finally {
      setLoadingPerformance(false);
    }
  }, []);

  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected) toast.success("Google Business Profile connected");
    if (error) toast.error(decodeURIComponent(error));
  }, [searchParams]);

  useEffect(() => {
    loadStatus()
      .catch(() => toast.error("Failed to load Google Business Profile status"))
      .finally(() => setLoading(false));
  }, [loadStatus]);

  useEffect(() => {
    if (status?.oauthClientId) setOauthClientId(status.oauthClientId);
  }, [status?.oauthClientId]);

  useEffect(() => {
    if (!status?.connected) return;
    loadAccounts().catch(() => {});
    if (status.accountId) setSelectedAccountId(status.accountId);
  }, [status, loadAccounts]);

  useEffect(() => {
    if (!selectedAccountId) return;
    loadLocations(selectedAccountId).catch(() => {});
  }, [selectedAccountId, loadLocations]);

  useEffect(() => {
    if (!status?.locationId) return;
    loadPerformance(days);
  }, [status?.locationId, days, loadPerformance]);

  async function saveLocation(location: GbpLocation) {
    setSavingLocation(true);
    try {
      const res = await fetch("/api/marketing/google-business/location", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedAccountId,
          locationId: location.name,
          locationTitle: location.title,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save location");
      }
      toast.success("Location saved");
      await loadStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save location");
    } finally {
      setSavingLocation(false);
    }
  }

  async function saveCredentials() {
    if (!oauthClientId.trim()) {
      toast.error("Enter your OAuth client ID");
      return;
    }
    if (!oauthClientSecret.trim() && !status?.hasOAuthClientSecret) {
      toast.error("Enter your OAuth client secret");
      return;
    }

    setSavingCredentials(true);
    try {
      const res = await fetch("/api/marketing/google-business/credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: oauthClientId.trim(),
          ...(oauthClientSecret.trim() ? { clientSecret: oauthClientSecret.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save credentials");
      setStatus(data);
      setOauthClientSecret("");
      toast.success("Google OAuth credentials saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save credentials");
    } finally {
      setSavingCredentials(false);
    }
  }

  async function disconnect() {
    const res = await fetch("/api/marketing/google-business", { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to disconnect");
      return;
    }
    setPerformance(null);
    setLocations([]);
    setAccounts([]);
    await loadStatus();
    toast.success("Disconnected Google Business Profile");
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading Google Business Profile...</p>;
  }

  if (!status?.configured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-5 w-5" />
            Google Business Profile setup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 text-sm">
          <p className="text-muted-foreground">
            Create OAuth credentials in Google Cloud Console, then connect the Google account that
            manages your Business Profile to view impressions, calls, and website clicks.
          </p>

          <div className="space-y-3">
            <p className="font-medium">1. Enable APIs in Google Cloud</p>
            <p className="text-muted-foreground">
              In your Google Cloud project, enable{" "}
              <strong>My Business Account Management API</strong>,{" "}
              <strong>My Business Business Information API</strong>, and{" "}
              <strong>Business Profile Performance API</strong>.
            </p>
          </div>

          <div className="space-y-3">
            <p className="font-medium">2. Create OAuth client credentials</p>
            <p className="text-muted-foreground">
              Under APIs &amp; Services → Credentials, create an OAuth 2.0 client (Web application).
              Paste the client ID and secret below.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                OAuth client ID
              </label>
              <Input
                value={oauthClientId}
                onChange={(e) => setOauthClientId(e.target.value)}
                placeholder="123456789.apps.googleusercontent.com"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                OAuth client secret
              </label>
              <Input
                type="password"
                value={oauthClientSecret}
                onChange={(e) => setOauthClientSecret(e.target.value)}
                placeholder={
                  status?.hasOAuthClientSecret ? "Saved — enter only to replace" : "GOCSPX-..."
                }
                autoComplete="off"
              />
            </div>
            <Button onClick={() => void saveCredentials()} disabled={savingCredentials}>
              {savingCredentials ? "Saving..." : "Save credentials"}
            </Button>
          </div>

          <div className="space-y-3">
            <p className="font-medium">3. Add authorized redirect URI</p>
            <p className="text-muted-foreground">
              On the same OAuth client, add this exact redirect URI under Authorized redirect URIs:
            </p>
            <p className="rounded-md border bg-muted/30 p-3 font-mono text-xs text-foreground break-all">
              {redirectUri}
            </p>
          </div>

          <div className="space-y-3">
            <p className="font-medium">4. Connect your Google account</p>
            <p className="text-muted-foreground">
              After saving credentials above, this page will show a{" "}
              <strong>Connect Google Business Profile</strong> button. Sign in with the Google
              account that manages your Business Profile.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!status.connected) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-5 w-5" />
              Google Business Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Connect the Google account that manages your Business Profile to view impressions,
              calls, website clicks, and direction requests.
            </p>
            <Button asChild>
              <a href="/api/marketing/google-business">Connect Google Business Profile</a>
            </Button>
            <p className="text-xs text-muted-foreground">
              Redirect URI for Google Cloud:{" "}
              <code className="break-all">{redirectUri}</code>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">OAuth credentials</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                OAuth client ID
              </label>
              <Input
                value={oauthClientId}
                onChange={(e) => setOauthClientId(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                OAuth client secret
              </label>
              <Input
                type="password"
                value={oauthClientSecret}
                onChange={(e) => setOauthClientSecret(e.target.value)}
                placeholder={status.hasOAuthClientSecret ? "Saved — enter only to replace" : ""}
                autoComplete="off"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => void saveCredentials()}
              disabled={savingCredentials}
            >
              {savingCredentials ? "Saving..." : "Update credentials"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-5 w-5" />
              Google Business Profile
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {status.locationTitle ?? "Select a location to view performance"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Connected</Badge>
            {status.connectedAt ? (
              <span className="text-xs text-muted-foreground">
                Since {format(new Date(status.connectedAt), "MMM d, yyyy")}
              </span>
            ) : null}
            <Button variant="outline" size="sm" onClick={disconnect}>
              <Unplug className="mr-1 h-4 w-4" />
              Disconnect
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Account
            </label>
            <select
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
            >
              <option value="">Select account</option>
              {accounts.map((account) => (
                <option key={account.name} value={account.name}>
                  {account.accountName}
                </option>
              ))}
            </select>
          </div>

          {selectedAccountId ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Locations</p>
              {locations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No locations found for this account.</p>
              ) : (
                locations.map((location) => (
                  <div
                    key={location.name}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div>
                      <p className="font-medium">{location.title}</p>
                      {location.address ? (
                        <p className="text-sm text-muted-foreground">{location.address}</p>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      variant={status.locationId === location.name ? "default" : "outline"}
                      disabled={savingLocation}
                      onClick={() => saveLocation(location)}
                    >
                      {status.locationId === location.name ? "Selected" : "Use this location"}
                    </Button>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {status.locationId ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Performance</CardTitle>
              <p className="text-sm text-muted-foreground">
                {performance
                  ? `${performance.startDate} – ${performance.endDate}`
                  : `Last ${days} days`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {[7, 28, 90].map((range) => (
                <Button
                  key={range}
                  size="sm"
                  variant={days === range ? "default" : "outline"}
                  onClick={() => setDays(range)}
                >
                  {range}d
                </Button>
              ))}
              <Button
                size="icon"
                variant="outline"
                onClick={() => loadPerformance(days)}
                disabled={loadingPerformance}
              >
                <RefreshCw className={`h-4 w-4 ${loadingPerformance ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {loadingPerformance && !performance ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading metrics...
              </div>
            ) : performance ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border p-4">
                    <p className="text-2xl font-semibold">
                      {formatCount(performance.totals.impressions)}
                    </p>
                    <p className="text-sm text-muted-foreground">Total impressions</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-2xl font-semibold">
                      {formatCount(performance.totals.interactions)}
                    </p>
                    <p className="text-sm text-muted-foreground">Profile interactions</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-2xl font-semibold">
                      {formatCount(
                        performance.metrics.find((m) => m.metric === "CALL_CLICKS")?.total ?? 0
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">Call clicks</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-2xl font-semibold">
                      {formatCount(
                        performance.metrics.find((m) => m.metric === "WEBSITE_CLICKS")?.total ?? 0
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">Website clicks</p>
                  </div>
                </div>

                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left">
                      <tr>
                        <th className="px-4 py-3 font-medium">Metric</th>
                        <th className="px-4 py-3 font-medium text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {performance.metrics.map((metric) => (
                        <tr key={metric.metric} className="border-t">
                          <td className="px-4 py-3">{metric.label}</td>
                          <td className="px-4 py-3 text-right font-medium">
                            {formatCount(metric.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="text-xs text-muted-foreground">
                  Data from Google Business Profile Performance API. Metrics are daily totals;
                  multiple impressions by the same user in one day count once.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No performance data available yet.</p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
