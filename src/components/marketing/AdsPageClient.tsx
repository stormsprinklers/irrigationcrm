"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  MarketingEmptyTable,
  MarketingMetricGrid,
  MarketingSectionCard,
} from "@/components/marketing/MarketingMetricGrid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AdsCampaignRow, AdsDashboard } from "@/lib/marketing/ads-dashboard";

function formatCount(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCurrency(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrencyPrecise(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatRoas(value: number | null | undefined) {
  if (value == null) return "—";
  return `${value.toFixed(2)}x`;
}

function CampaignTable({
  rows,
  message,
  variant,
}: {
  rows: AdsCampaignRow[];
  message: string;
  variant: "google" | "meta";
}) {
  if (rows.length === 0) {
    const columns =
      variant === "google"
        ? ["Campaign", "Status", "Budget", "Spend", "Impressions", "Clicks", "CPC", "Conversions", "ROAS"]
        : ["Campaign", "Objective", "Status", "Budget", "Spend", "Impressions", "Clicks", "CPL", "ROAS"];
    return <MarketingEmptyTable columns={columns} message={message} />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            {variant === "google" ? (
              <>
                <th className="px-3 py-2 font-medium">Campaign</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Budget</th>
                <th className="px-3 py-2 font-medium">Spend</th>
                <th className="px-3 py-2 font-medium">Impressions</th>
                <th className="px-3 py-2 font-medium">Clicks</th>
                <th className="px-3 py-2 font-medium">CPC</th>
                <th className="px-3 py-2 font-medium">Conversions</th>
                <th className="px-3 py-2 font-medium">ROAS</th>
              </>
            ) : (
              <>
                <th className="px-3 py-2 font-medium">Campaign</th>
                <th className="px-3 py-2 font-medium">Objective</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Budget</th>
                <th className="px-3 py-2 font-medium">Spend</th>
                <th className="px-3 py-2 font-medium">Impressions</th>
                <th className="px-3 py-2 font-medium">Clicks</th>
                <th className="px-3 py-2 font-medium">CPL</th>
                <th className="px-3 py-2 font-medium">ROAS</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.platform}-${row.id}`} className="border-b border-border/60">
              <td className="px-3 py-2 font-medium">{row.name}</td>
              {variant === "meta" ? (
                <td className="px-3 py-2 capitalize text-muted-foreground">
                  {row.objective?.replace(/_/g, " ") ?? "—"}
                </td>
              ) : null}
              <td className="px-3 py-2 capitalize text-muted-foreground">{row.status.toLowerCase()}</td>
              <td className="px-3 py-2">{formatCurrency(row.budget)}</td>
              <td className="px-3 py-2">{formatCurrencyPrecise(row.spend)}</td>
              <td className="px-3 py-2">{formatCount(row.impressions)}</td>
              <td className="px-3 py-2">{formatCount(row.clicks)}</td>
              {variant === "google" ? (
                <>
                  <td className="px-3 py-2">{formatCurrencyPrecise(row.cpc)}</td>
                  <td className="px-3 py-2">{formatCount(row.conversions)}</td>
                  <td className="px-3 py-2">{formatRoas(row.roas)}</td>
                </>
              ) : (
                <>
                  <td className="px-3 py-2">
                    {row.conversions > 0 ? formatCurrencyPrecise(row.spend / row.conversions) : "—"}
                  </td>
                  <td className="px-3 py-2">{formatRoas(row.roas)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SetupBanner({ platform, setupUrl, message }: { platform: string; setupUrl: string; message: string }) {
  return (
    <p className="mb-4 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
      {message}{" "}
      <Link href={setupUrl} className="text-primary underline">
        Settings → {platform}
      </Link>
    </p>
  );
}

export function AdsPageClient() {
  const [dashboard, setDashboard] = useState<AdsDashboard | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (rangeDays: number) => {
    const res = await fetch(`/api/marketing/ads/dashboard?days=${rangeDays}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load ads dashboard");
    setDashboard(data as AdsDashboard);
  }, []);

  useEffect(() => {
    load(days)
      .catch(() => toast.error("Failed to load ads dashboard"))
      .finally(() => setLoading(false));
  }, [days, load]);

  async function refresh() {
    setRefreshing(true);
    try {
      await load(days);
    } catch {
      toast.error("Failed to refresh ads data");
    } finally {
      setRefreshing(false);
    }
  }

  const totals = dashboard?.totals;
  const anyReady = dashboard?.google.ready || dashboard?.meta.ready;

  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Marketing", "Ads"]}
        title="Paid ads"
        subtitle="Google PPC and Meta campaigns — spend, performance, and campaign breakdowns."
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={loading || refreshing}
              onClick={() => void refresh()}
            >
              {refreshing ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-4 w-4" />
              )}
              Refresh
            </Button>
            <Button size="sm" disabled>
              <Plus className="mr-1 h-4 w-4" />
              Create ad
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[7, 30, 90].map((range) => (
          <Button
            key={range}
            size="sm"
            variant={days === range ? "default" : "outline"}
            onClick={() => setDays(range)}
          >
            {range}d
          </Button>
        ))}
      </div>

      {!anyReady && !loading ? (
        <SetupBanner
          platform="Integrations"
          setupUrl="/settings/integrations/google-ads"
          message="Link Google Ads and Meta Ads in Settings to populate this dashboard."
        />
      ) : null}

      {loading && !dashboard ? (
        <div className="mb-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading ads metrics...
        </div>
      ) : (
        <>
          <MarketingMetricGrid
            className="mb-8"
            columns={6}
            comingSoon={!anyReady}
            metrics={[
              { label: "Total spend", value: formatCurrency(totals?.spend) },
              { label: "Impressions", value: formatCount(totals?.impressions) },
              { label: "Clicks", value: formatCount(totals?.clicks) },
              { label: "CPC", hint: "Cost per click", value: formatCurrencyPrecise(totals?.cpc) },
              { label: "CPL", hint: "Cost per lead", value: formatCurrencyPrecise(totals?.cpl) },
              { label: "CTR", value: formatPercent(totals?.ctr) },
            ]}
          />

          <MarketingMetricGrid
            className="mb-8"
            columns={4}
            comingSoon={!anyReady}
            metrics={[
              { label: "Conversions", value: formatCount(totals?.conversions) },
              { label: "Conversion rate", value: formatPercent(totals?.conversionRate) },
              { label: "ROAS", hint: "Return on ad spend", value: formatRoas(totals?.roas) },
              { label: "Active campaigns", value: formatCount(totals?.activeCampaigns) },
            ]}
          />
        </>
      )}

      <Tabs defaultValue="google-ppc" className="space-y-6">
        <TabsList>
          <TabsTrigger value="google-ppc">Google PPC</TabsTrigger>
          <TabsTrigger value="google-lsa">Google LSA</TabsTrigger>
          <TabsTrigger value="meta">Meta ads</TabsTrigger>
          <TabsTrigger value="budgets">Budgets &amp; schedules</TabsTrigger>
        </TabsList>

        <TabsContent value="google-ppc">
          {dashboard && !dashboard.google.ready ? (
            <SetupBanner
              platform="Google Ads"
              setupUrl={dashboard.google.setupUrl}
              message={
                dashboard.google.connected
                  ? "Choose a Google Ads customer account in"
                  : "Connect Google Ads in"
              }
            />
          ) : null}
          {dashboard?.google.error ? (
            <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {dashboard.google.error}
            </p>
          ) : null}
          <MarketingSectionCard
            title="Google Search &amp; Display campaigns"
            description={
              dashboard?.google.accountName
                ? `${dashboard.google.accountName} · last ${days} days`
                : "Search, display, and remarketing campaigns from Google Ads."
            }
            action={
              dashboard?.google.ready ? (
                <Badge variant="secondary">Live</Badge>
              ) : (
                <Badge variant="outline">Not linked</Badge>
              )
            }
          >
            <CampaignTable
              rows={dashboard?.google.campaigns ?? []}
              variant="google"
              message="Connect Google Ads in Settings and select an account to view campaigns."
            />
          </MarketingSectionCard>
        </TabsContent>

        <TabsContent value="google-lsa">
          <MarketingSectionCard
            title="Google Local Services Ads"
            description="Pay-per-lead local service ads for qualified job requests."
            action={<Badge variant="secondary">Coming soon</Badge>}
          >
            <MarketingEmptyTable
              columns={["Service type", "Status", "Budget", "Leads", "CPL", "Booked jobs"]}
              message="Local Services Ads use a separate Google API. Link Google Ads above for PPC reporting; LSA support is planned next."
            />
          </MarketingSectionCard>
        </TabsContent>

        <TabsContent value="meta">
          {dashboard && !dashboard.meta.ready ? (
            <SetupBanner
              platform="Meta Ads"
              setupUrl={dashboard.meta.setupUrl}
              message={
                dashboard.meta.connected
                  ? "Choose a Meta ad account in"
                  : "Add a Meta ads token and ad account in"
              }
            />
          ) : null}
          {dashboard?.meta.error ? (
            <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {dashboard.meta.error}
            </p>
          ) : null}
          <MarketingSectionCard
            title="Meta ads (Facebook &amp; Instagram)"
            description={
              dashboard?.meta.accountName
                ? `${dashboard.meta.accountName} · last ${days} days`
                : "Paid social campaigns across Facebook and Instagram placements."
            }
            action={
              dashboard?.meta.ready ? (
                <Badge variant="secondary">Live</Badge>
              ) : (
                <Badge variant="outline">Not linked</Badge>
              )
            }
          >
            <CampaignTable
              rows={dashboard?.meta.campaigns ?? []}
              variant="meta"
              message="Connect Meta Ads in Settings to manage and report on paid social campaigns."
            />
          </MarketingSectionCard>
        </TabsContent>

        <TabsContent value="budgets">
          <MarketingSectionCard
            title="Budgets &amp; schedules"
            description="Campaign budgets pulled from linked Google Ads and Meta accounts."
          >
            <MarketingEmptyTable
              columns={[
                "Platform",
                "Campaign",
                "Budget type",
                "Amount",
                "Schedule",
                "Pacing",
                "Status",
              ]}
              message={
                anyReady
                  ? "Daily and lifetime budgets appear on each campaign row in the Google PPC and Meta tabs."
                  : "Link ad accounts in Settings to view budget information."
              }
            />
          </MarketingSectionCard>
        </TabsContent>
      </Tabs>
    </ContentArea>
  );
}
