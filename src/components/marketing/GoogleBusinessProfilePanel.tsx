"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { GoogleBusinessEngagementPanel } from "@/components/marketing/GoogleBusinessEngagementPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GbpReviewSummary } from "@/lib/google-business/engagement-types";
import type { GbpConnectionStatus, GbpPerformanceSummary } from "@/lib/google-business/types";

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function GbpSetupPrompt({ status }: { status: GbpConnectionStatus }) {
  let message =
    "Connect your Google Business Profile in Settings to view performance, reviews, and posts.";
  let actionLabel = "Connect in Settings";

  if (!status.configured) {
    message =
      "Google OAuth credentials are not configured on the server. An admin must set GOOGLE_BUSINESS_OAUTH_CLIENT_ID and GOOGLE_BUSINESS_OAUTH_CLIENT_SECRET (or shared GOOGLE_OAUTH_*) in Vercel.";
    actionLabel = "View setup in Settings";
  } else if (status.connected && !status.locationId) {
    message = "Choose a business location in Settings to load marketing data from Google.";
    actionLabel = "Choose location";
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-6 text-sm">
        <p className="text-muted-foreground">{message}</p>
        <Button size="sm" asChild>
          <Link href="/settings/integrations/google-business">{actionLabel}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function GoogleBusinessProfilePanel() {
  const [status, setStatus] = useState<GbpConnectionStatus | null>(null);
  const [performance, setPerformance] = useState<GbpPerformanceSummary | null>(null);
  const [reviewSummary, setReviewSummary] = useState<GbpReviewSummary | null>(null);
  const [days, setDays] = useState(28);
  const [loading, setLoading] = useState(true);
  const [loadingPerformance, setLoadingPerformance] = useState(false);
  const [loadingReviewSummary, setLoadingReviewSummary] = useState(false);

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/marketing/google-business/status");
    if (res.ok) setStatus(await res.json());
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

  const loadReviewSummary = useCallback(async () => {
    setLoadingReviewSummary(true);
    try {
      const res = await fetch("/api/marketing/google-business/reviews/summary");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load reviews");
      setReviewSummary(data as GbpReviewSummary);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load review count");
      setReviewSummary(null);
    } finally {
      setLoadingReviewSummary(false);
    }
  }, []);

  useEffect(() => {
    loadStatus()
      .catch(() => toast.error("Failed to load Google Business Profile status"))
      .finally(() => setLoading(false));
  }, [loadStatus]);

  useEffect(() => {
    if (!status?.locationId) return;
    loadPerformance(days);
    loadReviewSummary();
  }, [status?.locationId, days, loadPerformance, loadReviewSummary]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading Google Business Profile...</p>;
  }

  if (!status || !status.configured || !status.connected || !status.locationId) {
    return status ? <GbpSetupPrompt status={status} /> : null;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">
              Reviews · {status.locationTitle ?? "Selected location"}
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              {loadingReviewSummary && !reviewSummary ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <p className="text-3xl font-semibold tabular-nums">
                    {reviewSummary?.totalReviewCount != null
                      ? formatCount(reviewSummary.totalReviewCount)
                      : "—"}
                  </p>
                  <span className="text-sm font-medium text-green-600 tabular-nums">
                    +{reviewSummary?.newReviewsLast7Days ?? 0}
                  </span>
                  <span className="text-xs text-muted-foreground">last 7 days</span>
                </>
              )}
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={loadingReviewSummary}
            onClick={() => void loadReviewSummary()}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${loadingReviewSummary ? "animate-spin" : ""}`} />
            Refresh reviews
          </Button>
        </div>
      </div>

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

      <GoogleBusinessEngagementPanel />
    </div>
  );
}
