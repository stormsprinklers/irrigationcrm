import type { AdsDateRange } from "@/lib/marketing/ads-date-range";
import type { GoogleAdsSummary, GoogleLsaSummary } from "@/lib/google-ads/types";
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

export type AdsLsaCategoryRow = {
  categoryId: string;
  label: string;
  leads: number;
  chargedLeads: number;
  bookedLeads: number;
};

export type AdsLsaLeadRow = {
  id: string;
  leadType: string;
  leadStatus: string;
  categoryLabel: string;
  creationDateTime: string | null;
  leadCharged: boolean;
  consumerName: string | null;
  phoneNumber: string | null;
};

export type AdsLsaBlock = {
  connected: boolean;
  ready: boolean;
  accountName: string | null;
  setupUrl: string;
  error: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  chargedLeads: number;
  bookedLeads: number;
  cpl: number | null;
  activeCampaigns: number;
  campaigns: AdsCampaignRow[];
  categories: AdsLsaCategoryRow[];
  recentLeads: AdsLsaLeadRow[];
  /** First-party CRM conversion tracking (CSR answer → booked visit → revenue). */
  crm: {
    matchedCalls: number;
    bookedCalls: number;
    revenue: number;
    bookingRate: number | null;
  } | null;
};

export type AdsDashboard = {
  days: number;
  dateRange: {
    startDate: string;
    endDate: string;
    label: string;
    isAllTime: boolean;
  };
  google: AdsPlatformBlock;
  googleLsa: AdsLsaBlock;
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

function formatLsaCategoryLabel(categoryId: string) {
  if (!categoryId || categoryId === "unknown") return "Uncategorized";
  return categoryId
    .replace(/^xcat:service_area_business_/, "")
    .replace(/^xcat:/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

function buildGoogleLsaBlock(
  summary: GoogleLsaSummary | null,
  connected: boolean,
  ready: boolean,
  error: string | null,
  crm: AdsLsaBlock["crm"]
): AdsLsaBlock {
  return {
    connected,
    ready,
    accountName: summary?.customerName ?? null,
    setupUrl: "/settings/integrations/google-ads",
    error,
    spend: summary?.spend ?? 0,
    impressions: summary?.impressions ?? 0,
    clicks: summary?.clicks ?? 0,
    leads: summary?.leads ?? 0,
    chargedLeads: summary?.chargedLeads ?? 0,
    bookedLeads: summary?.bookedLeads ?? 0,
    cpl: summary?.cpl ?? null,
    activeCampaigns: summary?.activeCampaigns ?? 0,
    campaigns: (summary?.campaigns ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      platform: "google" as const,
      objective: "LOCAL_SERVICES",
      budget: row.budgetMicros != null ? row.budgetMicros / 1_000_000 : null,
      spend: row.spend,
      impressions: row.impressions,
      clicks: row.clicks,
      cpc: ratio(row.spend, row.clicks),
      conversions: row.conversions,
      roas: null,
    })),
    categories: (summary?.categories ?? []).map((row) => ({
      categoryId: row.categoryId,
      label: formatLsaCategoryLabel(row.categoryId),
      leads: row.leads,
      chargedLeads: row.chargedLeads,
      bookedLeads: row.bookedLeads,
    })),
    recentLeads: (summary?.recentLeads ?? []).map((row) => ({
      id: row.id,
      leadType: row.leadType,
      leadStatus: row.leadStatus,
      categoryLabel: formatLsaCategoryLabel(row.categoryId ?? "unknown"),
      creationDateTime: row.creationDateTime,
      leadCharged: row.leadCharged,
      consumerName: row.consumerName,
      phoneNumber: row.phoneNumber,
    })),
    crm,
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
  dateRange: AdsDateRange;
  googleSummary: GoogleAdsSummary | null;
  googleConnected: boolean;
  googleReady: boolean;
  googleError: string | null;
  googleLsaSummary: GoogleLsaSummary | null;
  googleLsaError: string | null;
  googleLsaCrm: AdsLsaBlock["crm"];
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
  const googleLsa = buildGoogleLsaBlock(
    input.googleLsaSummary,
    input.googleConnected,
    input.googleReady,
    input.googleLsaError,
    input.googleLsaCrm
  );
  const meta = buildMetaBlock(
    input.metaSummary,
    input.metaConnected,
    input.metaReady,
    input.metaError
  );

  const spend = google.spend + googleLsa.spend + meta.spend;
  const impressions = google.impressions + googleLsa.impressions + meta.impressions;
  const clicks = google.clicks + googleLsa.clicks + meta.clicks;
  const conversions = google.conversions + googleLsa.leads + meta.conversions;
  const leadLike = google.conversions + googleLsa.chargedLeads + meta.conversions;

  return {
    days: input.dateRange.presetDays ?? 0,
    dateRange: {
      startDate: input.dateRange.startDate,
      endDate: input.dateRange.endDate,
      label: input.dateRange.label,
      isAllTime: input.dateRange.isAllTime,
    },
    google,
    googleLsa,
    meta,
    totals: {
      spend,
      impressions,
      clicks,
      cpc: ratio(spend, clicks),
      ctr: ratio(clicks, impressions),
      conversions,
      conversionRate: ratio(conversions, clicks),
      cpl: ratio(spend, leadLike),
      roas: ratio(input.googleSummary?.conversionsValue ?? 0, spend),
      activeCampaigns:
        google.activeCampaigns + googleLsa.activeCampaigns + meta.activeCampaigns,
    },
  };
}
