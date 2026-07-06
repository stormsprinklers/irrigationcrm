import type { AdsDateRange } from "@/lib/marketing/ads-date-range";
import { metaInsightsField } from "@/lib/marketing/ads-date-range";
import { prisma } from "@/lib/prisma";

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type MetaAdsConnectionStatus = {
  connected: boolean;
  hasToken: boolean;
  adAccountId: string | null;
  adAccountName: string | null;
  connectedAt: string | null;
  setupUrl: "/settings/integrations/meta-ads";
  usesMetaWebhooksToken: boolean;
};

export type MetaAdAccount = {
  id: string;
  accountId: string;
  name: string;
  currency: string | null;
  status: string | null;
};

export type MetaAdsCampaignRow = {
  id: string;
  name: string;
  status: string;
  objective: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
};

export type MetaAdsSummary = {
  adAccountId: string;
  adAccountName: string;
  days: number;
  startDate: string;
  endDate: string;
  rangeLabel: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  activeCampaigns: number;
  campaigns: MetaAdsCampaignRow[];
};

export class MetaAdsApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

async function graphGet<T>(path: string, accessToken: string, params: Record<string, string> = {}) {
  const url = new URL(path.startsWith("http") ? path : `${GRAPH_BASE}${path}`);
  url.searchParams.set("access_token", accessToken);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const res = await fetch(url.toString(), { cache: "no-store" });
  const data = (await res.json()) as T & { error?: { message?: string; code?: number } };

  if (!res.ok || data.error) {
    throw new MetaAdsApiError(data.error?.message ?? `Meta Graph API error (${res.status})`, res.status);
  }

  return data;
}

export async function getMetaAdsAccessToken(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { metaAdsAccessToken: true, metaPageAccessToken: true },
  });

  const token = company?.metaAdsAccessToken ?? company?.metaPageAccessToken;
  if (!token) {
    throw new MetaAdsApiError(
      "Add a Meta access token with ads_read in Settings → Meta Ads (or Meta webhooks)",
      400
    );
  }

  return { token, dedicated: Boolean(company?.metaAdsAccessToken) };
}

export async function getMetaAdsConnectionStatus(companyId: string): Promise<MetaAdsConnectionStatus> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      metaAdsAccessToken: true,
      metaPageAccessToken: true,
      metaAdAccountId: true,
      metaAdAccountName: true,
      metaAdsConnectedAt: true,
    },
  });

  const hasToken = Boolean(company?.metaAdsAccessToken || company?.metaPageAccessToken);

  return {
    connected: Boolean(hasToken && company?.metaAdAccountId),
    hasToken,
    adAccountId: company?.metaAdAccountId ?? null,
    adAccountName: company?.metaAdAccountName ?? null,
    connectedAt: company?.metaAdsConnectedAt?.toISOString() ?? null,
    setupUrl: "/settings/integrations/meta-ads",
    usesMetaWebhooksToken: Boolean(!company?.metaAdsAccessToken && company?.metaPageAccessToken),
  };
}

export async function listMetaAdAccounts(companyId: string): Promise<MetaAdAccount[]> {
  const { token } = await getMetaAdsAccessToken(companyId);

  const data = await graphGet<{
    data?: Array<{
      id?: string;
      account_id?: string;
      name?: string;
      currency?: string;
      account_status?: number;
    }>;
  }>("/me/adaccounts", token, {
    fields: "id,account_id,name,currency,account_status",
    limit: "100",
  });

  return (data.data ?? [])
    .filter((row) => row.id && row.account_id)
    .map((row) => ({
      id: row.id!,
      accountId: row.account_id!,
      name: row.name ?? row.account_id!,
      currency: row.currency ?? null,
      status:
        row.account_status === 1
          ? "ACTIVE"
          : row.account_status === 2
            ? "DISABLED"
            : row.account_status != null
              ? String(row.account_status)
              : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveMetaAdAccount(
  companyId: string,
  adAccountId: string,
  adAccountName: string
) {
  await prisma.company.update({
    where: { id: companyId },
    data: {
      metaAdAccountId: adAccountId.replace(/^act_/, ""),
      metaAdAccountName: adAccountName,
      metaAdsConnectedAt: new Date(),
    },
  });
}

export async function saveMetaAdsAccessToken(companyId: string, accessToken: string) {
  await prisma.company.update({
    where: { id: companyId },
    data: { metaAdsAccessToken: accessToken.trim() || null },
  });
}

function parseMetaBudget(value: string | undefined) {
  if (!value) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num / 100 : null;
}

function countLeadActions(actions: Array<{ action_type?: string; value?: string }> | undefined) {
  if (!actions?.length) return 0;
  const leadTypes = new Set([
    "lead",
    "onsite_conversion.lead_grouped",
    "offsite_conversion.fb_pixel_lead",
  ]);
  return actions.reduce((sum, action) => {
    if (!action.action_type || !leadTypes.has(action.action_type)) return sum;
    return sum + Number(action.value ?? 0);
  }, 0);
}

export async function getMetaAdsSummary(
  companyId: string,
  range: AdsDateRange
): Promise<MetaAdsSummary> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { metaAdAccountId: true, metaAdAccountName: true },
  });

  if (!company?.metaAdAccountId) {
    throw new MetaAdsApiError("Select a Meta ad account", 400);
  }

  const { token } = await getMetaAdsAccessToken(companyId);
  const actId = company.metaAdAccountId.replace(/^act_/, "");
  const insightsField = metaInsightsField(range);

  const data = await graphGet<{
    data?: Array<{
      id?: string;
      name?: string;
      status?: string;
      objective?: string;
      daily_budget?: string;
      lifetime_budget?: string;
      insights?: {
        data?: Array<{
          spend?: string;
          impressions?: string;
          clicks?: string;
          actions?: Array<{ action_type?: string; value?: string }>;
        }>;
      };
    }>;
  }>(`/act_${actId}/campaigns`, token, {
    fields: `id,name,status,objective,daily_budget,lifetime_budget,${insightsField}{spend,impressions,clicks,actions}`,
    limit: "100",
  });

  const campaigns: MetaAdsCampaignRow[] = (data.data ?? []).map((row) => {
    const insight = row.insights?.data?.[0];
    return {
      id: row.id ?? "",
      name: row.name ?? "Untitled campaign",
      status: row.status ?? "UNKNOWN",
      objective: row.objective ?? null,
      dailyBudget: parseMetaBudget(row.daily_budget),
      lifetimeBudget: parseMetaBudget(row.lifetime_budget),
      spend: Number(insight?.spend ?? 0),
      impressions: Number(insight?.impressions ?? 0),
      clicks: Number(insight?.clicks ?? 0),
      conversions: countLeadActions(insight?.actions),
    };
  });

  campaigns.sort((a, b) => b.spend - a.spend);

  return {
    adAccountId: actId,
    adAccountName: company.metaAdAccountName ?? actId,
    days: range.presetDays ?? 0,
    startDate: range.startDate,
    endDate: range.endDate,
    rangeLabel: range.label,
    spend: campaigns.reduce((sum, row) => sum + row.spend, 0),
    impressions: campaigns.reduce((sum, row) => sum + row.impressions, 0),
    clicks: campaigns.reduce((sum, row) => sum + row.clicks, 0),
    conversions: campaigns.reduce((sum, row) => sum + row.conversions, 0),
    activeCampaigns: campaigns.filter((row) => row.status === "ACTIVE").length,
    campaigns,
  };
}
