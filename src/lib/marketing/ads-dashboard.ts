import type { GoogleAdsSummary } from "@/lib/google-ads/types";
import type { MetaAdsSummary } from "@/lib/meta/ads";

export type AdsCampaignRow = {
  id: string;
  name: string;
  status: string;
  platform: "google" | "meta";
  objective: string | null;
  budget: number | null;
  spend: number;
  impressions: number;
  clicks: number;
  cpc: number | null;
  conversions: number;
  roas: number | null;
};

export type AdsPlatformBlock = {
  connected: boolean;
  ready: boolean;
  accountName: string | null;
  setupUrl: string;
  error: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  cpc: number | null;
  ctr: number | null;
  conversions: number;
  conversionRate: number | null;
  cpl: number | null;
  roas: number | null;
  activeCampaigns: number;
  campaigns: AdsCampaignRow[];
};

export type AdsDashboard = {
  days: number;
  google: AdsPlatformBlock;
  meta: AdsPlatformBlock;
  totals: {
    spend: number;
    impressions: number;
    clicks: number;
    cpc: number | null;
    ctr: number | null;
    conversions: number;
    conversionRate: number | null;
    cpl: number | null;
    roas: number | null;
    activeCampaigns: number;
  };
};

function ratio(numerator: number, denominator: number) {
  if (!denominator) return null;
  return numerator / denominator;
}

function buildGoogleBlock(
  summary: GoogleAdsSummary | null,
  connected: boolean,
  ready: boolean,
  error: string | null
): AdsPlatformBlock {
  const spend = summary?.spend ?? 0;
  const clicks = summary?.clicks ?? 0;
  const impressions = summary?.impressions ?? 0;
  const conversions = summary?.conversions ?? 0;
  const conversionsValue = summary?.conversionsValue ?? 0;

  return {
    connected,
    ready,
    accountName: summary?.customerName ?? null,
    setupUrl: "/settings/integrations/google-ads",
    error,
    spend,
    impressions,
    clicks,
    cpc: ratio(spend, clicks),
    ctr: ratio(clicks, impressions),
    conversions,
    conversionRate: ratio(conversions, clicks),
    cpl: ratio(spend, conversions),
    roas: ratio(conversionsValue, spend),
    activeCampaigns: summary?.activeCampaigns ?? 0,
    campaigns: (summary?.campaigns ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      platform: "google" as const,
      objective: row.channelType,
      budget: row.budgetMicros != null ? row.budgetMicros / 1_000_000 : null,
      spend: row.spend,
      impressions: row.impressions,
      clicks: row.clicks,
      cpc: ratio(row.spend, row.clicks),
      conversions: row.conversions,
      roas: ratio(row.conversionsValue, row.spend),
    })),
  };
}

function buildMetaBlock(
  summary: MetaAdsSummary | null,
  connected: boolean,
  ready: boolean,
  error: string | null
): AdsPlatformBlock {
  const spend = summary?.spend ?? 0;
  const clicks = summary?.clicks ?? 0;
  const impressions = summary?.impressions ?? 0;
  const conversions = summary?.conversions ?? 0;

  return {
    connected,
    ready,
    accountName: summary?.adAccountName ?? null,
    setupUrl: "/settings/integrations/meta-ads",
    error,
    spend,
    impressions,
    clicks,
    cpc: ratio(spend, clicks),
    ctr: ratio(clicks, impressions),
    conversions,
    conversionRate: ratio(conversions, clicks),
    cpl: ratio(spend, conversions),
    roas: null,
    activeCampaigns: summary?.activeCampaigns ?? 0,
    campaigns: (summary?.campaigns ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      platform: "meta" as const,
      objective: row.objective,
      budget: row.dailyBudget ?? row.lifetimeBudget,
      spend: row.spend,
      impressions: row.impressions,
      clicks: row.clicks,
      cpc: ratio(row.spend, row.clicks),
      conversions: row.conversions,
      roas: null,
    })),
  };
}

export function buildAdsDashboard(input: {
  days: number;
  googleSummary: GoogleAdsSummary | null;
  googleConnected: boolean;
  googleReady: boolean;
  googleError: string | null;
  metaSummary: MetaAdsSummary | null;
  metaConnected: boolean;
  metaReady: boolean;
  metaError: string | null;
}): AdsDashboard {
  const google = buildGoogleBlock(
    input.googleSummary,
    input.googleConnected,
    input.googleReady,
    input.googleError
  );
  const meta = buildMetaBlock(
    input.metaSummary,
    input.metaConnected,
    input.metaReady,
    input.metaError
  );

  const spend = google.spend + meta.spend;
  const impressions = google.impressions + meta.impressions;
  const clicks = google.clicks + meta.clicks;
  const conversions = google.conversions + meta.conversions;

  return {
    days: input.days,
    google,
    meta,
    totals: {
      spend,
      impressions,
      clicks,
      cpc: ratio(spend, clicks),
      ctr: ratio(clicks, impressions),
      conversions,
      conversionRate: ratio(conversions, clicks),
      cpl: ratio(spend, conversions),
      roas: ratio(
        (input.googleSummary?.conversionsValue ?? 0),
        spend
      ),
      activeCampaigns: google.activeCampaigns + meta.activeCampaigns,
    },
  };
}
