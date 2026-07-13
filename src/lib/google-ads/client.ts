import {
  createOAuthState,
  exchangeGoogleOAuthCode,
  verifyOAuthState,
} from "@/lib/google-oauth/oauth";
import {
  getGeneralGoogleOAuthConfig,
  isGeneralGoogleOAuthConfigured,
} from "@/lib/google-oauth/config";
import type { AdsDateRange } from "@/lib/marketing/ads-date-range";
import { googleAdsDateClause } from "@/lib/marketing/ads-date-range";
import type {
  GoogleAdsCampaignRow,
  GoogleAdsConnectionStatus,
  GoogleAdsCustomer,
  GoogleAdsSummary,
  GoogleLsaCampaignRow,
  GoogleLsaCategoryRow,
  GoogleLsaLeadRow,
  GoogleLsaSummary,
} from "@/lib/google-ads/types";
import { GOOGLE_ADS_SCOPE } from "@/lib/google-ads/types";
import { prisma } from "@/lib/prisma";

/** v18 sunset Aug 2025 — use a supported major version (see Google Ads API sunset schedule). */
const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION?.trim() || "v24";
const GOOGLE_ADS_API = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

export class GoogleAdsApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export function isGoogleAdsConfigured() {
  return isGeneralGoogleOAuthConfigured();
}

export function hasGoogleAdsDeveloperToken() {
  return Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim());
}

export function buildGoogleAdsAuthUrl(companyId: string, redirectUri: string) {
  const { clientId } = getGeneralGoogleOAuthConfig();
  if (!clientId) throw new GoogleAdsApiError("Google OAuth is not configured", 503);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_ADS_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: createOAuthState(companyId),
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export { verifyOAuthState };

export async function exchangeOAuthCode(code: string, redirectUri: string) {
  return exchangeGoogleOAuthCode(
    code,
    redirectUri,
    getGeneralGoogleOAuthConfig(),
    GoogleAdsApiError
  );
}

function normalizeCustomerId(id: string) {
  return id.replace(/-/g, "").replace(/^customers\//, "");
}

function microsToUnits(value: string | number | undefined | null) {
  if (value == null) return 0;
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return 0;
  return num / 1_000_000;
}

function localServicesLeadDateClause(range: AdsDateRange) {
  return (
    `local_services_lead.creation_date_time >= '${range.startDate} 00:00:00'` +
    ` AND local_services_lead.creation_date_time <= '${range.endDate} 23:59:59'`
  );
}

export async function getGoogleAdsAccessToken(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { googleAdsRefreshToken: true },
  });

  if (!company?.googleAdsRefreshToken) {
    throw new GoogleAdsApiError("Google Ads is not connected", 400);
  }

  const { clientId, clientSecret } = getGeneralGoogleOAuthConfig();
  if (!clientId || !clientSecret) {
    throw new GoogleAdsApiError("Google OAuth is not configured", 503);
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: company.googleAdsRefreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw new GoogleAdsApiError(data.error ?? "Failed to refresh Google access token", res.status);
  }

  return data.access_token;
}

async function googleAdsFetch<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
  loginCustomerId?: string | null
): Promise<T> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  if (!developerToken) {
    throw new GoogleAdsApiError(
      "Set GOOGLE_ADS_DEVELOPER_TOKEN in Vercel (Google Ads API developer token)",
      503
    );
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (loginCustomerId) {
    headers["login-customer-id"] = normalizeCustomerId(loginCustomerId);
  }

  const res = await fetch(`${GOOGLE_ADS_API}${path}`, { ...init, headers });
  const bodyText = await res.text();

  let data: T & {
    error?: { message?: string; status?: string; code?: number };
  };

  try {
    data = JSON.parse(bodyText) as typeof data;
  } catch {
    const isHtml = bodyText.trimStart().startsWith("<");
    throw new GoogleAdsApiError(
      isHtml
        ? `Google Ads API returned an HTML error page (HTTP ${res.status}). Confirm GOOGLE_ADS_DEVELOPER_TOKEN is set, API access is approved, and GOOGLE_ADS_API_VERSION (${GOOGLE_ADS_API_VERSION}) is supported.`
        : `Google Ads API returned invalid JSON (HTTP ${res.status})`,
      res.status || 502
    );
  }

  if (!res.ok) {
    const message = data.error?.message ?? `Google Ads API error (${res.status})`;
    throw new GoogleAdsApiError(message, res.status);
  }

  return data;
}

type CustomerDetail = {
  id: string;
  name: string;
  manager: boolean;
};

async function fetchCustomerDetail(
  accessToken: string,
  customerId: string,
  loginCustomerId: string | null
): Promise<CustomerDetail> {
  const detail = await googleAdsFetch<{
    results?: Array<{
      customer?: { descriptiveName?: string; manager?: boolean; id?: string };
    }>;
  }>(
    accessToken,
    `/customers/${customerId}/googleAds:search`,
    {
      method: "POST",
      body: JSON.stringify({
        query:
          "SELECT customer.id, customer.descriptive_name, customer.manager FROM customer LIMIT 1",
      }),
    },
    loginCustomerId
  );

  const customer = detail.results?.[0]?.customer;
  return {
    id: customerId,
    name: customer?.descriptiveName ?? customerId,
    manager: Boolean(customer?.manager),
  };
}

/**
 * List accessible Google Ads accounts. When an MCC is present, client accounts
 * get a suggestedLoginCustomerId so subsequent API calls can set login-customer-id.
 */
export async function listGoogleAdsCustomers(companyId: string): Promise<GoogleAdsCustomer[]> {
  const accessToken = await getGoogleAdsAccessToken(companyId);
  const data = await googleAdsFetch<{ resourceNames?: string[] }>(
    accessToken,
    "/customers:listAccessibleCustomers"
  );

  const ids = [...new Set((data.resourceNames ?? []).map(normalizeCustomerId))];

  type Resolved = CustomerDetail & { ok: boolean; viaManagerId: string | null };
  const resolved: Resolved[] = [];

  for (const customerId of ids) {
    try {
      const detail = await fetchCustomerDetail(accessToken, customerId, null);
      resolved.push({ ...detail, ok: true, viaManagerId: null });
    } catch {
      resolved.push({
        id: customerId,
        name: customerId,
        manager: false,
        ok: false,
        viaManagerId: null,
      });
    }
  }

  const managers = resolved.filter((row) => row.ok && row.manager);
  const soleManagerId = managers.length === 1 ? managers[0].id : null;

  const customers: GoogleAdsCustomer[] = [];

  for (const row of resolved) {
    if (row.ok && row.manager) {
      customers.push({
        id: row.id,
        name: row.name,
        manager: true,
        suggestedLoginCustomerId: null,
      });
      continue;
    }

    let detail: CustomerDetail = row;
    let viaManagerId: string | null = row.viaManagerId;

    if (!row.ok || managers.length > 0) {
      for (const manager of managers) {
        if (manager.id === row.id) continue;
        try {
          const viaManager = await fetchCustomerDetail(accessToken, row.id, manager.id);
          if (!viaManager.manager) {
            detail = viaManager;
            viaManagerId = manager.id;
            break;
          }
        } catch {
          // Try the next manager account.
        }
      }
    }

    // With a single MCC over the client (common setup), always prefer routing
    // through the manager so login-customer-id is set correctly.
    if (!viaManagerId && soleManagerId && soleManagerId !== detail.id && !detail.manager) {
      viaManagerId = soleManagerId;
    }

    customers.push({
      id: detail.id,
      name: detail.name,
      manager: Boolean(detail.manager),
      suggestedLoginCustomerId: detail.manager ? null : viaManagerId,
    });
  }

  return customers.sort((a, b) => {
    if (a.manager !== b.manager) return a.manager ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

export async function getGoogleAdsConnectionStatus(
  companyId: string
): Promise<GoogleAdsConnectionStatus | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      googleAdsRefreshToken: true,
      googleAdsCustomerId: true,
      googleAdsCustomerName: true,
      googleAdsLoginCustomerId: true,
      googleAdsConnectedAt: true,
    },
  });

  if (!company) return null;

  const env = getGeneralGoogleOAuthConfig();

  return {
    connected: Boolean(company.googleAdsRefreshToken),
    customerId: company.googleAdsCustomerId,
    customerName: company.googleAdsCustomerName,
    loginCustomerId: company.googleAdsLoginCustomerId,
    connectedAt: company.googleAdsConnectedAt?.toISOString() ?? null,
    configured: isGoogleAdsConfigured(),
    hasDeveloperToken: hasGoogleAdsDeveloperToken(),
    oauthEnv: {
      hasClientId: Boolean(env.clientId),
      hasClientSecret: Boolean(env.clientSecret),
    },
    setupUrl: "/settings/integrations/google-ads",
  };
}

export async function saveGoogleAdsCustomer(
  companyId: string,
  customerId: string,
  customerName: string,
  loginCustomerId?: string | null
) {
  const normalizedCustomerId = normalizeCustomerId(customerId);
  let resolvedLoginId = loginCustomerId ? normalizeCustomerId(loginCustomerId) : null;

  // Auto-resolve MCC when the UI didn't send one (e.g. sole manager over client).
  if (!resolvedLoginId) {
    try {
      const accessible = await listGoogleAdsCustomers(companyId);
      const selected = accessible.find((row) => row.id === normalizedCustomerId);
      if (selected?.manager) {
        throw new GoogleAdsApiError(
          "Select your client Google Ads account, not the manager (MCC) account",
          400
        );
      }
      if (selected?.suggestedLoginCustomerId) {
        resolvedLoginId = selected.suggestedLoginCustomerId;
      } else {
        const managers = accessible.filter((row) => row.manager);
        if (managers.length === 1 && managers[0].id !== normalizedCustomerId) {
          resolvedLoginId = managers[0].id;
        }
      }
    } catch (error) {
      if (error instanceof GoogleAdsApiError) throw error;
      // Listing can fail transiently; still save the customer without login id.
    }
  }

  await prisma.company.update({
    where: { id: companyId },
    data: {
      googleAdsCustomerId: normalizedCustomerId,
      googleAdsCustomerName: customerName,
      googleAdsLoginCustomerId: resolvedLoginId,
      googleAdsConnectedAt: new Date(),
    },
  });
}

async function getSelectedGoogleAdsAccount(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      googleAdsCustomerId: true,
      googleAdsCustomerName: true,
      googleAdsLoginCustomerId: true,
    },
  });

  if (!company?.googleAdsCustomerId) {
    throw new GoogleAdsApiError("Select a Google Ads account", 400);
  }

  let loginCustomerId = company.googleAdsLoginCustomerId
    ? normalizeCustomerId(company.googleAdsLoginCustomerId)
    : null;

  // Heal older connections that selected a client under an MCC but never stored login-customer-id.
  if (!loginCustomerId) {
    try {
      const accessible = await listGoogleAdsCustomers(companyId);
      const selected = accessible.find(
        (row) => row.id === normalizeCustomerId(company.googleAdsCustomerId!)
      );
      const resolved =
        selected?.suggestedLoginCustomerId ??
        accessible.find((row) => row.manager && row.id !== company.googleAdsCustomerId)?.id ??
        null;
      if (resolved) {
        loginCustomerId = normalizeCustomerId(resolved);
        await prisma.company.update({
          where: { id: companyId },
          data: { googleAdsLoginCustomerId: loginCustomerId },
        });
      }
    } catch {
      // Keep going without a login-customer-id; direct-access accounts still work.
    }
  }

  return {
    customerId: normalizeCustomerId(company.googleAdsCustomerId),
    customerName: company.googleAdsCustomerName ?? company.googleAdsCustomerId,
    loginCustomerId,
  };
}

function mapCampaignRows(
  results: Array<{
    campaign?: {
      id?: string;
      name?: string;
      status?: string;
      advertisingChannelType?: string;
    };
    campaignBudget?: { amountMicros?: string };
    metrics?: {
      costMicros?: string;
      impressions?: string;
      clicks?: string;
      conversions?: number;
      conversionsValue?: number;
    };
  }>
): GoogleAdsCampaignRow[] {
  return results.map((row) => ({
    id: String(row.campaign?.id ?? ""),
    name: row.campaign?.name ?? "Untitled campaign",
    status: row.campaign?.status ?? "UNKNOWN",
    channelType: row.campaign?.advertisingChannelType ?? null,
    budgetMicros: row.campaignBudget?.amountMicros
      ? Number(row.campaignBudget.amountMicros)
      : null,
    spend: microsToUnits(row.metrics?.costMicros),
    impressions: Number(row.metrics?.impressions ?? 0),
    clicks: Number(row.metrics?.clicks ?? 0),
    conversions: Number(row.metrics?.conversions ?? 0),
    conversionsValue: Number(row.metrics?.conversionsValue ?? 0),
  }));
}

function summarizeCampaigns(campaigns: GoogleAdsCampaignRow[], range: AdsDateRange, account: {
  customerId: string;
  customerName: string;
}): GoogleAdsSummary {
  const spend = campaigns.reduce((sum, row) => sum + row.spend, 0);
  const impressions = campaigns.reduce((sum, row) => sum + row.impressions, 0);
  const clicks = campaigns.reduce((sum, row) => sum + row.clicks, 0);
  const conversions = campaigns.reduce((sum, row) => sum + row.conversions, 0);
  const conversionsValue = campaigns.reduce((sum, row) => sum + row.conversionsValue, 0);
  const activeCampaigns = campaigns.filter((row) => row.status === "ENABLED").length;

  return {
    customerId: account.customerId,
    customerName: account.customerName,
    days: range.presetDays ?? 0,
    startDate: range.startDate,
    endDate: range.endDate,
    rangeLabel: range.label,
    spend,
    impressions,
    clicks,
    conversions,
    conversionsValue,
    activeCampaigns,
    campaigns,
  };
}

/** PPC / non-LSA campaigns (Search, Display, PMax, etc.). */
export async function getGoogleAdsSummary(
  companyId: string,
  range: AdsDateRange
): Promise<GoogleAdsSummary> {
  const account = await getSelectedGoogleAdsAccount(companyId);
  const accessToken = await getGoogleAdsAccessToken(companyId);
  const dateClause = googleAdsDateClause(range);

  const data = await googleAdsFetch<{
    results?: Array<{
      campaign?: {
        id?: string;
        name?: string;
        status?: string;
        advertisingChannelType?: string;
      };
      campaignBudget?: { amountMicros?: string };
      metrics?: {
        costMicros?: string;
        impressions?: string;
        clicks?: string;
        conversions?: number;
        conversionsValue?: number;
      };
    }>;
  }>(
    accessToken,
    `/customers/${account.customerId}/googleAds:search`,
    {
      method: "POST",
      body: JSON.stringify({
        query: `
          SELECT
            campaign.id,
            campaign.name,
            campaign.status,
            campaign.advertising_channel_type,
            campaign_budget.amount_micros,
            metrics.cost_micros,
            metrics.impressions,
            metrics.clicks,
            metrics.conversions,
            metrics.conversions_value
          FROM campaign
          WHERE ${dateClause}
            AND campaign.status != 'REMOVED'
            AND campaign.advertising_channel_type != 'LOCAL_SERVICES'
          ORDER BY metrics.cost_micros DESC
          LIMIT 100
        `,
      }),
    },
    account.loginCustomerId
  );

  return summarizeCampaigns(mapCampaignRows(data.results ?? []), range, account);
}

/** Local Services Ads campaigns + lead volume from local_services_lead. */
export async function getGoogleLsaSummary(
  companyId: string,
  range: AdsDateRange
): Promise<GoogleLsaSummary> {
  const account = await getSelectedGoogleAdsAccount(companyId);
  const accessToken = await getGoogleAdsAccessToken(companyId);
  const dateClause = googleAdsDateClause(range);
  const leadDateClause = localServicesLeadDateClause(range);

  const [campaignData, leadData] = await Promise.all([
    googleAdsFetch<{
      results?: Array<{
        campaign?: {
          id?: string;
          name?: string;
          status?: string;
        };
        campaignBudget?: { amountMicros?: string };
        metrics?: {
          costMicros?: string;
          impressions?: string;
          clicks?: string;
          conversions?: number;
        };
      }>;
    }>(
      accessToken,
      `/customers/${account.customerId}/googleAds:search`,
      {
        method: "POST",
        body: JSON.stringify({
          query: `
            SELECT
              campaign.id,
              campaign.name,
              campaign.status,
              campaign_budget.amount_micros,
              metrics.cost_micros,
              metrics.impressions,
              metrics.clicks,
              metrics.conversions
            FROM campaign
            WHERE ${dateClause}
              AND campaign.status != 'REMOVED'
              AND campaign.advertising_channel_type = 'LOCAL_SERVICES'
            ORDER BY metrics.cost_micros DESC
            LIMIT 50
          `,
        }),
      },
      account.loginCustomerId
    ).catch(() => ({ results: [] as never[] })),
    googleAdsFetch<{
      results?: Array<{
        localServicesLead?: {
          id?: string;
          leadType?: string;
          leadStatus?: string;
          categoryId?: string;
          serviceId?: string;
          creationDateTime?: string;
          leadCharged?: boolean;
          contactDetails?: {
            consumerName?: string;
            phoneNumber?: string;
            email?: string;
          };
        };
      }>;
    }>(
      accessToken,
      `/customers/${account.customerId}/googleAds:search`,
      {
        method: "POST",
        body: JSON.stringify({
          query: `
            SELECT
              local_services_lead.id,
              local_services_lead.lead_type,
              local_services_lead.lead_status,
              local_services_lead.category_id,
              local_services_lead.service_id,
              local_services_lead.creation_date_time,
              local_services_lead.lead_charged,
              local_services_lead.contact_details
            FROM local_services_lead
            WHERE ${leadDateClause}
            ORDER BY local_services_lead.creation_date_time DESC
            LIMIT 500
          `,
        }),
      },
      account.loginCustomerId
    ).catch(() => ({ results: [] as never[] })),
  ]);

  const campaigns: GoogleLsaCampaignRow[] = (campaignData.results ?? []).map((row) => ({
    id: String(row.campaign?.id ?? ""),
    name: row.campaign?.name ?? "Local Services campaign",
    status: row.campaign?.status ?? "UNKNOWN",
    budgetMicros: row.campaignBudget?.amountMicros
      ? Number(row.campaignBudget.amountMicros)
      : null,
    spend: microsToUnits(row.metrics?.costMicros),
    impressions: Number(row.metrics?.impressions ?? 0),
    clicks: Number(row.metrics?.clicks ?? 0),
    conversions: Number(row.metrics?.conversions ?? 0),
  }));

  const recentLeads: GoogleLsaLeadRow[] = (leadData.results ?? []).map((row) => {
    const lead = row.localServicesLead;
    return {
      id: String(lead?.id ?? ""),
      leadType: lead?.leadType ?? "UNKNOWN",
      leadStatus: lead?.leadStatus ?? "UNKNOWN",
      categoryId: lead?.categoryId ?? null,
      serviceId: lead?.serviceId ?? null,
      creationDateTime: lead?.creationDateTime ?? null,
      leadCharged: Boolean(lead?.leadCharged),
      consumerName: lead?.contactDetails?.consumerName ?? null,
      phoneNumber: lead?.contactDetails?.phoneNumber ?? null,
      email: lead?.contactDetails?.email ?? null,
    };
  });

  const categoryMap = new Map<string, GoogleLsaCategoryRow>();
  for (const lead of recentLeads) {
    const key = lead.categoryId ?? "unknown";
    const current = categoryMap.get(key) ?? {
      categoryId: key,
      leads: 0,
      chargedLeads: 0,
      bookedLeads: 0,
    };
    current.leads += 1;
    if (lead.leadCharged) current.chargedLeads += 1;
    if (lead.leadStatus === "BOOKED") current.bookedLeads += 1;
    categoryMap.set(key, current);
  }

  const spend = campaigns.reduce((sum, row) => sum + row.spend, 0);
  const impressions = campaigns.reduce((sum, row) => sum + row.impressions, 0);
  const clicks = campaigns.reduce((sum, row) => sum + row.clicks, 0);
  const leads = recentLeads.length;
  const chargedLeads = recentLeads.filter((lead) => lead.leadCharged).length;
  const bookedLeads = recentLeads.filter((lead) => lead.leadStatus === "BOOKED").length;

  return {
    customerId: account.customerId,
    customerName: account.customerName,
    days: range.presetDays ?? 0,
    startDate: range.startDate,
    endDate: range.endDate,
    rangeLabel: range.label,
    spend,
    impressions,
    clicks,
    leads,
    chargedLeads,
    bookedLeads,
    cpl: chargedLeads > 0 ? spend / chargedLeads : leads > 0 ? spend / leads : null,
    activeCampaigns: campaigns.filter((row) => row.status === "ENABLED").length,
    campaigns,
    categories: [...categoryMap.values()].sort((a, b) => b.leads - a.leads),
    recentLeads: recentLeads.slice(0, 50),
  };
}
