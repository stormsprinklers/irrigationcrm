"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { BarChart3, Globe, Loader2, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MarketingMetricGrid,
  MarketingSectionCard,
} from "@/components/marketing/MarketingMetricGrid";
import type {
  Ga4ConnectionStatus,
  Ga4DashboardData,
  Ga4Property,
} from "@/lib/google-analytics/types";

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function GoogleAnalyticsPanel() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Ga4ConnectionStatus | null>(null);
  const [properties, setProperties] = useState<Ga4Property[]>([]);
  const [dashboard, setDashboard] = useState<Ga4DashboardData | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [loadingProperties, setLoadingProperties] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [savingProperty, setSavingProperty] = useState(false);

  const redirectUri =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/marketing/google-analytics/callback`
      : "/api/marketing/google-analytics/callback";

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/marketing/google-analytics/status");
    if (res.ok) setStatus(await res.json());
  }, []);

  const loadProperties = useCallback(async () => {
    setLoadingProperties(true);
    try {
      const res = await fetch("/api/marketing/google-analytics/properties");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load GA4 properties");
      setProperties(data.properties ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load GA4 properties");
      setProperties([]);
    } finally {
      setLoadingProperties(false);
    }
  }, []);

  const loadDashboard = useCallback(async (rangeDays: number) => {
    setLoadingDashboard(true);
    try {
      const res = await fetch(`/api/marketing/google-analytics/dashboard?days=${rangeDays}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load Google Analytics data");
      setDashboard(data as Ga4DashboardData);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load Google Analytics data");
      setDashboard(null);
    } finally {
      setLoadingDashboard(false);
    }
  }, []);

  useEffect(() => {
    const connected = searchParams.get("ga_connected");
    const error = searchParams.get("ga_error");
    if (connected) toast.success("Google Analytics connected");
    if (error) toast.error(decodeURIComponent(error), { duration: 10000 });
  }, [searchParams]);

  useEffect(() => {
    loadStatus()
      .catch(() => toast.error("Failed to load Google Analytics status"))
      .finally(() => setLoading(false));
  }, [loadStatus]);

  useEffect(() => {
    if (!status?.connected) return;
    void loadProperties();
  }, [status?.connected, loadProperties]);

  useEffect(() => {
    if (!status?.connected || !status.propertyId) return;
    void loadDashboard(days);
  }, [status?.connected, status?.propertyId, days, loadDashboard]);

  async function saveProperty(propertyId: string) {
    setSavingProperty(true);
    try {
      const res = await fetch("/api/marketing/google-analytics/property", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save property");
      toast.success("Google Analytics property saved");
      await loadStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save property");
    } finally {
      setSavingProperty(false);
    }
  }

  async function disconnect() {
    const res = await fetch("/api/marketing/google-analytics", { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to disconnect");
      return;
    }
    setDashboard(null);
    setProperties([]);
    await loadStatus();
    toast.success("Disconnected Google Analytics");
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading Google Analytics...</p>;
  }

  if (!status) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Could not load Google Analytics status.{" "}
          <button type="button" className="text-primary underline" onClick={() => loadStatus()}>
            Try again
          </button>
        </CardContent>
      </Card>
    );
  }

  if (!status.configured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-5 w-5" />
            Google Analytics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Server OAuth credentials are required. Uses the same{" "}
            <code className="text-xs">GOOGLE_OAUTH_CLIENT_ID</code> /{" "}
            <code className="text-xs">GOOGLE_OAUTH_CLIENT_SECRET</code> as other Google integrations.
          </p>
          <p>
            Redirect URI: <code className="text-xs">{redirectUri}</code>
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!status.connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-5 w-5" />
            Google Analytics
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Connect GA4 to show organic sessions, conversions, engagement, and top pages. Website
            tracking runs through GTM — see website{" "}
            <code className="text-xs">lib/analytics/GTM-SETUP.md</code>.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Enable Google Analytics Data API + Admin API in Google Cloud and add scope{" "}
            <code className="text-xs">analytics.readonly</code>.
          </p>
          <Button asChild>
            <a href="/api/marketing/google-analytics">
              <Globe className="mr-2 h-4 w-4" />
              Connect Google Analytics
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const overview = dashboard?.overview;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-5 w-5" />
              Google Analytics
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {status.propertyId
                ? `Property ID: ${status.propertyId}`
                : "Select a GA4 property to load data."}
              {status.connectedAt
                ? ` · Connected ${format(new Date(status.connectedAt), "MMM d, yyyy")}`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <select
              className="h-9 max-w-xs rounded-md border border-input bg-transparent px-3 text-sm"
              value={status.propertyId ?? ""}
              disabled={loadingProperties || savingProperty || properties.length === 0}
              onChange={(event) => saveProperty(event.target.value)}
            >
              {!status.propertyId ? <option value="">Select property</option> : null}
              {properties.map((property) => (
                <option key={property.propertyId} value={property.propertyId}>
                  {property.displayName} ({property.propertyId})
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              <option value={7}>Last 7 days</option>
              <option value={28}>Last 28 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={!status.propertyId || loadingDashboard}
              onClick={() => loadDashboard(days)}
            >
              <RefreshCw className={`mr-1 h-4 w-4 ${loadingDashboard ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" variant="ghost" onClick={disconnect}>
              <Unplug className="mr-1 h-4 w-4" />
              Disconnect
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!status.propertyId ? (
            <p className="text-sm text-muted-foreground">
              {loadingProperties
                ? "Loading GA4 properties..."
                : "Choose a property above to load analytics."}
            </p>
          ) : loadingDashboard && !dashboard ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading Google Analytics data...
            </div>
          ) : overview ? (
            <p className="text-xs text-muted-foreground">
              Data from {overview.startDate} to {overview.endDate}. GA4 reporting may be delayed 24–48
              hours.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {overview ? (
        <MarketingMetricGrid
          comingSoon={false}
          columns={6}
          metrics={[
            {
              label: "Organic sessions",
              value: formatCount(overview.organicSessions),
              hint: "Organic Search channel",
            },
            {
              label: "Total sessions",
              value: formatCount(overview.totalSessions),
            },
            {
              label: "Conversions",
              value: formatCount(overview.conversions),
              hint: "All channels",
            },
            {
              label: "Organic conversions",
              value: formatCount(overview.organicConversions),
            },
            {
              label: "Engagement rate",
              value: formatPercent(overview.engagementRate),
            },
            {
              label: "GA4 property",
              value: overview.propertyId,
              hint: "Numeric property ID",
            },
          ]}
        />
      ) : null}

      {dashboard ? (
        <>
          <MarketingSectionCard
            title="Top pages (GA4)"
            description="Page views and sessions from Google Analytics."
          >
            {dashboard.pages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No page data for this period yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Page path</th>
                      <th className="px-3 py-2 font-medium">Page views</th>
                      <th className="px-3 py-2 font-medium">Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.pages.map((row) => (
                      <tr key={row.pagePath} className="border-b last:border-b-0">
                        <td className="max-w-md truncate px-3 py-2 font-mono text-xs">
                          {row.pagePath}
                        </td>
                        <td className="px-3 py-2">{formatCount(row.screenPageViews)}</td>
                        <td className="px-3 py-2">{formatCount(row.sessions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </MarketingSectionCard>

          <MarketingSectionCard
            title="Conversion events"
            description="Key events marked as conversions in GA4."
          >
            {dashboard.conversions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No conversion events yet. Mark key events in GA4 Admin after GTM is published.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Event</th>
                      <th className="px-3 py-2 font-medium">Event count</th>
                      <th className="px-3 py-2 font-medium">Conversions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.conversions.map((row) => (
                      <tr key={row.eventName} className="border-b last:border-b-0">
                        <td className="px-3 py-2 font-medium">{row.eventName}</td>
                        <td className="px-3 py-2">{formatCount(row.eventCount)}</td>
                        <td className="px-3 py-2">
                          {row.conversions > 0 ? (
                            <Badge variant="secondary">{formatCount(row.conversions)}</Badge>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </MarketingSectionCard>
        </>
      ) : null}
    </div>
  );
}
