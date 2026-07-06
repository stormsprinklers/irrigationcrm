"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { BarChart3, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MarketingMetricGrid,
  MarketingSectionCard,
} from "@/components/marketing/MarketingMetricGrid";

type RankedRow = { label: string; count: number };

type WebsiteAnalyticsReport = {
  totalEvents: number;
  totalPageViews: number;
  totalSessions: number;
  homepage: {
    scroll50: number;
    scroll90: number;
    avgDwellSeconds: number | null;
    dwellSamples: number;
  };
  conversions: {
    phoneClicks: number;
    smsClicks: number;
    formSubmits: number;
    bookingCompleted: number;
    organicConversions: number;
    total: number;
  };
  topPages: RankedRow[];
  topLandingPages: RankedRow[];
  topUtmSources: RankedRow[];
  topUtmCampaigns: RankedRow[];
  topSourceBuckets: RankedRow[];
  from: string;
  to: string;
  days: number;
};

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDuration(seconds: number | null) {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function formatBucket(label: string) {
  return label.replace(/_/g, " ");
}

function RankedTable({ rows, emptyLabel }: { rows: RankedRow[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="px-3 py-2 font-medium">Label</th>
            <th className="px-3 py-2 font-medium">Count</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b last:border-b-0">
              <td className="max-w-md px-3 py-2 font-medium">{row.label}</td>
              <td className="px-3 py-2">{formatCount(row.count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WebsiteAnalyticsPanel() {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<WebsiteAnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadReport = useCallback(async (rangeDays: number, silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch(`/api/marketing/website-analytics/dashboard?days=${rangeDays}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load website analytics");
      setReport(data as WebsiteAnalyticsReport);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load website analytics");
      setReport(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadReport(days);
  }, [days, loadReport]);

  if (loading && !report) {
    return <p className="text-sm text-muted-foreground">Loading website analytics...</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-5 w-5" />
              Website analytics
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              First-party tracking from your website — page views, UTMs, homepage engagement, and
              conversions. No Google Analytics setup required.
            </p>
            {report ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {format(new Date(report.from), "MMM d")} –{" "}
                {format(new Date(report.to), "MMM d, yyyy")}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            <Button size="sm" variant="outline" disabled={refreshing} onClick={() => loadReport(days, true)}>
              <RefreshCw className={`mr-1 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!report ? (
            <p className="text-sm text-muted-foreground">
              No website events yet. Ensure{" "}
              <code className="text-xs">CRM_INTEGRATION_URL</code> and{" "}
              <code className="text-xs">CRM_INTEGRATION_KEY</code> are set on the website, then
              visit the site to generate data.
            </p>
          ) : report.totalEvents === 0 ? (
            <p className="text-sm text-muted-foreground">
              No events recorded in this period. Traffic will appear here once visitors browse the
              site.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {report && report.totalEvents > 0 ? (
        <>
          <MarketingMetricGrid
            comingSoon={false}
            columns={7}
            metrics={[
              { label: "Page views", value: formatCount(report.totalPageViews) },
              { label: "Sessions", value: formatCount(report.totalSessions), hint: "New visits" },
              {
                label: "Phone clicks",
                value: formatCount(report.conversions.phoneClicks),
              },
              {
                label: "SMS clicks",
                value: formatCount(report.conversions.smsClicks),
              },
              {
                label: "Form submits",
                value: formatCount(report.conversions.formSubmits),
              },
              {
                label: "Bookings completed",
                value: formatCount(report.conversions.bookingCompleted),
              },
              {
                label: "Organic conversions",
                value: formatCount(report.conversions.organicConversions),
                hint: "Google organic attribution",
              },
            ]}
          />

          <MarketingSectionCard
            title="Homepage engagement"
            description="Scroll depth and average dwell time on the home page."
          >
            <MarketingMetricGrid
              comingSoon={false}
              columns={3}
              metrics={[
                {
                  label: "50% scroll depth",
                  value: formatCount(report.homepage.scroll50),
                },
                {
                  label: "90% scroll depth",
                  value: formatCount(report.homepage.scroll90),
                },
                {
                  label: "Avg. dwell time",
                  value: formatDuration(report.homepage.avgDwellSeconds),
                  hint:
                    report.homepage.dwellSamples > 0
                      ? `${formatCount(report.homepage.dwellSamples)} samples (10s+ on page)`
                      : "Fires after 10 seconds on homepage",
                },
              ]}
            />
          </MarketingSectionCard>

          <div className="grid gap-6 lg:grid-cols-2">
            <MarketingSectionCard
              title="Top pages"
              description="Most viewed pages on the website."
            >
              <RankedTable rows={report.topPages} emptyLabel="No page views yet." />
            </MarketingSectionCard>

            <MarketingSectionCard
              title="Top landing pages"
              description="First page seen in each new session."
            >
              <RankedTable rows={report.topLandingPages} emptyLabel="No landing page data yet." />
            </MarketingSectionCard>

            <MarketingSectionCard title="UTM sources" description="Traffic by utm_source parameter.">
              <RankedTable rows={report.topUtmSources} emptyLabel="No UTM source data yet." />
            </MarketingSectionCard>

            <MarketingSectionCard
              title="UTM campaigns"
              description="Traffic by utm_campaign parameter."
            >
              <RankedTable rows={report.topUtmCampaigns} emptyLabel="No UTM campaign data yet." />
            </MarketingSectionCard>
          </div>

          {report.topSourceBuckets.length > 0 ? (
            <MarketingSectionCard
              title="Traffic sources"
              description="Classified source buckets (organic, ads, direct, etc.)."
            >
              <RankedTable
                rows={report.topSourceBuckets.map((row) => ({
                  ...row,
                  label: formatBucket(row.label),
                }))}
                emptyLabel="No source data yet."
              />
            </MarketingSectionCard>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
