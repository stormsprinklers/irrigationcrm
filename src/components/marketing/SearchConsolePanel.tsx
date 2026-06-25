"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { Globe, Loader2, RefreshCw, Search, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MarketingMetricGrid,
  MarketingSectionCard,
} from "@/components/marketing/MarketingMetricGrid";
import type {
  GscConnectionStatus,
  GscDashboardData,
  GscSite,
} from "@/lib/google-search-console/types";
import type { Ga4Summary } from "@/lib/google-analytics/types";

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatPosition(value: number) {
  return value > 0 ? value.toFixed(1) : "—";
}

function formatPageUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" ? parsed.hostname : `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return url;
  }
}

export function SearchConsolePanel() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<GscConnectionStatus | null>(null);
  const [sites, setSites] = useState<GscSite[]>([]);
  const [dashboard, setDashboard] = useState<GscDashboardData | null>(null);
  const [gaSummary, setGaSummary] = useState<Ga4Summary | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [loadingSites, setLoadingSites] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [savingSite, setSavingSite] = useState(false);

  const redirectUri =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/marketing/search-console/callback`
      : "/api/marketing/search-console/callback";

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/marketing/search-console/status");
    if (res.ok) setStatus(await res.json());
  }, []);

  const loadSites = useCallback(async () => {
    setLoadingSites(true);
    try {
      const res = await fetch("/api/marketing/search-console/sites");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load Search Console properties");
      setSites(data.sites ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load properties");
      setSites([]);
    } finally {
      setLoadingSites(false);
    }
  }, []);

  const loadDashboard = useCallback(async (rangeDays: number) => {
    setLoadingDashboard(true);
    try {
      const res = await fetch(`/api/marketing/search-console/dashboard?days=${rangeDays}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load Search Console data");
      setDashboard(data as GscDashboardData);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load Search Console data");
      setDashboard(null);
    } finally {
      setLoadingDashboard(false);
    }
  }, []);

  const loadGaSummary = useCallback(async (rangeDays: number) => {
    try {
      const res = await fetch(`/api/marketing/google-analytics/summary?days=${rangeDays}`);
      if (res.ok) setGaSummary(await res.json());
    } catch {
      /* optional */
    }
  }, []);

  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected) toast.success("Google Search Console connected");
    if (error) {
      toast.error(decodeURIComponent(error), { duration: 10000 });
    }
  }, [searchParams]);

  useEffect(() => {
    loadStatus()
      .catch(() => toast.error("Failed to load Search Console status"))
      .finally(() => setLoading(false));
  }, [loadStatus]);

  useEffect(() => {
    if (!status?.connected) return;
    void loadSites();
  }, [status?.connected, loadSites]);

  useEffect(() => {
    if (!status?.connected || !status.siteUrl) return;
    void loadDashboard(days);
    void loadGaSummary(days);
  }, [status?.connected, status?.siteUrl, days, loadDashboard, loadGaSummary]);

  async function saveSite(siteUrl: string) {
    setSavingSite(true);
    try {
      const res = await fetch("/api/marketing/search-console/site", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save property");
      toast.success("Search Console property saved");
      await loadStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save property");
    } finally {
      setSavingSite(false);
    }
  }

  async function disconnect() {
    const res = await fetch("/api/marketing/search-console", { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to disconnect");
      return;
    }
    setDashboard(null);
    setSites([]);
    await loadStatus();
    toast.success("Disconnected Google Search Console");
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading Search Console...</p>;
  }

  if (!status) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Could not load Search Console status.{" "}
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
            <Search className="h-5 w-5" />
            Google Search Console
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Server OAuth credentials are required before you can connect Search Console. These are
            the same variables used for Google Business Profile.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <code className="text-xs">GOOGLE_OAUTH_CLIENT_ID</code>:{" "}
              {status.oauthEnv.hasClientId ? "detected" : "missing"}
            </li>
            <li>
              <code className="text-xs">GOOGLE_OAUTH_CLIENT_SECRET</code>:{" "}
              {status.oauthEnv.hasClientSecret ? "detected" : "missing"}
            </li>
          </ul>
          <p>
            Add this authorized redirect URI on your OAuth client:{" "}
            <code className="text-xs">{redirectUri}</code>
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
            <Search className="h-5 w-5" />
            Google Search Console
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Connect Search Console to show clicks, impressions, CTR, average position, top queries,
            and landing pages in this dashboard.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Redirect URI for Google Cloud OAuth client:{" "}
            <code className="text-xs">{redirectUri}</code>
          </p>
          <Button asChild>
            <a href="/api/marketing/search-console">
              <Globe className="mr-2 h-4 w-4" />
              Connect Search Console
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const overview = dashboard?.overview;
  const sitemapErrors = dashboard?.sitemaps.reduce((sum, item) => sum + (item.errors ?? 0), 0) ?? 0;
  const sitemapWarnings = dashboard?.sitemaps.reduce((sum, item) => sum + (item.warnings ?? 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-5 w-5" />
              Google Search Console
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {status.siteUrl
                ? `Property: ${status.siteUrl}`
                : "Select which Search Console property to use."}
              {status.connectedAt
                ? ` · Connected ${format(new Date(status.connectedAt), "MMM d, yyyy")}`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-9 max-w-xs rounded-md border border-input bg-transparent px-3 text-sm"
              value={status.siteUrl ?? ""}
              disabled={loadingSites || savingSite || sites.length === 0}
              onChange={(event) => saveSite(event.target.value)}
            >
              {!status.siteUrl ? <option value="">Select property</option> : null}
              {sites.map((site) => (
                <option key={site.siteUrl} value={site.siteUrl}>
                  {site.siteUrl}
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
              disabled={!status.siteUrl || loadingDashboard}
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
          {!status.siteUrl ? (
            <p className="text-sm text-muted-foreground">
              {loadingSites
                ? "Loading Search Console properties..."
                : "Choose a property above to load search analytics."}
            </p>
          ) : loadingDashboard && !dashboard ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading Search Console data...
            </div>
          ) : overview ? (
            <p className="text-xs text-muted-foreground">
              Data from {overview.startDate} to {overview.endDate}. Search Console reporting is
              typically delayed by a few days.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {overview ? (
        <MarketingMetricGrid
          comingSoon={false}
          columns={6}
          metrics={[
            { label: "Organic clicks", value: formatCount(overview.clicks), hint: "Search Console" },
            {
              label: "Search impressions",
              value: formatCount(overview.impressions),
            },
            {
              label: "Avg. keyword position",
              value: formatPosition(overview.position),
            },
            {
              label: "Search CTR",
              value: formatPercent(overview.ctr),
            },
            {
              label: "Pages with impressions",
              value: formatCount(overview.pagesWithImpressions),
              hint: "In selected date range",
            },
            {
              label: "Organic conversions",
              value:
                gaSummary?.connected && gaSummary.organicConversions != null
                  ? formatCount(gaSummary.organicConversions)
                  : "—",
              hint: gaSummary?.connected ? "Google Analytics" : "Connect Google Analytics below",
            },
          ]}
        />
      ) : null}

      {dashboard ? (
        <>
          <MarketingSectionCard
            title="Top queries"
            description="Search terms that drove impressions and clicks."
          >
            {dashboard.queries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No query data for this period yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Keyword</th>
                      <th className="px-3 py-2 font-medium">Position</th>
                      <th className="px-3 py-2 font-medium">Impressions</th>
                      <th className="px-3 py-2 font-medium">Clicks</th>
                      <th className="px-3 py-2 font-medium">CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.queries.map((row) => (
                      <tr key={row.query} className="border-b last:border-b-0">
                        <td className="px-3 py-2 font-medium">{row.query}</td>
                        <td className="px-3 py-2">{formatPosition(row.position)}</td>
                        <td className="px-3 py-2">{formatCount(row.impressions)}</td>
                        <td className="px-3 py-2">{formatCount(row.clicks)}</td>
                        <td className="px-3 py-2">{formatPercent(row.ctr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </MarketingSectionCard>

          <MarketingSectionCard
            title="Top landing pages"
            description="Pages receiving organic search traffic."
          >
            {dashboard.pages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No page data for this period yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Page</th>
                      <th className="px-3 py-2 font-medium">Position</th>
                      <th className="px-3 py-2 font-medium">Impressions</th>
                      <th className="px-3 py-2 font-medium">Clicks</th>
                      <th className="px-3 py-2 font-medium">CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.pages.map((row) => (
                      <tr key={row.page} className="border-b last:border-b-0">
                        <td className="max-w-md px-3 py-2">
                          <a
                            href={row.page}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-primary hover:underline"
                            title={row.page}
                          >
                            {formatPageUrl(row.page)}
                          </a>
                        </td>
                        <td className="px-3 py-2">{formatPosition(row.position)}</td>
                        <td className="px-3 py-2">{formatCount(row.impressions)}</td>
                        <td className="px-3 py-2">{formatCount(row.clicks)}</td>
                        <td className="px-3 py-2">{formatPercent(row.ctr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </MarketingSectionCard>

          <MarketingSectionCard
            title="Sitemaps"
            description="Submitted sitemaps and processing status from Search Console."
          >
            {dashboard.sitemaps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sitemaps found for this property.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={sitemapErrors > 0 ? "destructive" : "secondary"}>
                    {sitemapErrors} sitemap errors
                  </Badge>
                  <Badge variant={sitemapWarnings > 0 ? "outline" : "secondary"}>
                    {sitemapWarnings} warnings
                  </Badge>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Sitemap</th>
                        <th className="px-3 py-2 font-medium">Last submitted</th>
                        <th className="px-3 py-2 font-medium">Last downloaded</th>
                        <th className="px-3 py-2 font-medium">Errors</th>
                        <th className="px-3 py-2 font-medium">Warnings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.sitemaps.map((row) => (
                        <tr key={row.path} className="border-b last:border-b-0">
                          <td className="px-3 py-2 font-medium">{row.path}</td>
                          <td className="px-3 py-2">
                            {row.lastSubmitted
                              ? format(new Date(row.lastSubmitted), "MMM d, yyyy")
                              : "—"}
                          </td>
                          <td className="px-3 py-2">
                            {row.lastDownloaded
                              ? format(new Date(row.lastDownloaded), "MMM d, yyyy")
                              : "—"}
                          </td>
                          <td className="px-3 py-2">{row.errors ?? 0}</td>
                          <td className="px-3 py-2">{row.warnings ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </MarketingSectionCard>
        </>
      ) : null}
    </div>
  );
}
