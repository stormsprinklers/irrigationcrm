import {
  createOAuthState,
  exchangeOAuthCode,
  getGoogleOAuthConfig,
  isGoogleBusinessConfigured,
  verifyOAuthState,
} from "@/lib/google-business/client";
import type {
  GoogleAdsCampaignRow,
  GoogleAdsConnectionStatus,
  GoogleAdsCustomer,
  GoogleAdsSummary,
} from "@/lib/google-ads/types";
import { GOOGLE_ADS_SCOPE } from "@/lib/google-ads/types";
import { prisma } from "@/lib/prisma";

const GOOGLE_ADS_API = "https://googleads.googleapis.com/v18";

export class GoogleAdsApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export function isGoogleAdsConfigured() {
  return isGoogleBusinessConfigured();
}

export function hasGoogleAdsDeveloperToken() {
  return Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim());
}

export function buildGoogleAdsAuthUrl(companyId: string, redirectUri: string) {
  const { clientId } = getGoogleOAuthConfig();
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

export { exchangeOAuthCode, verifyOAuthState };

function normalizeCustomerId(id: string) {
  return id.replace(/-/g, "").replace(/^customers\//, "");
}

function microsToUnits(value: string | number | undefined | null) {
  if (value == null) return 0;
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return 0;
  return num / 1_000_000;
}

export async function getGoogleAdsAccessToken(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { googleAdsRefreshToken: true },
  });

  if (!company?.googleAdsRefreshToken) {
    throw new GoogleAdsApiError("Google Ads is not connected", 400);
  }

  const { clientId, clientSecret } = getGoogleOAuthConfig();
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
  const data = (await res.json()) as T & {
    error?: { message?: string; status?: string; code?: number };
  };

  if (!res.ok) {
    const message = data.error?.message ?? `Google Ads API error (${res.status})`;
    throw new GoogleAdsApiError(message, res.status);
  }

  return data;
}

export async function listGoogleAdsCustomers(companyId: string): Promise<GoogleAdsCustomer[]> {
  const accessToken = await getGoogleAdsAccessToken(companyId);
  const data = await googleAdsFetch<{ resourceNames?: string[] }>(
    accessToken,
    "/customers:listAccessibleCustomers"
  );

  const customers: GoogleAdsCustomer[] = [];
  for (const resourceName of data.resourceNames ?? []) {
    const customerId = normalizeCustomerId(resourceName);
    try {
      const detail = await googleAdsFetch<{ results?: Array<{ customer?: { descriptiveName?: string; manager?: boolean } }> }>(
        accessToken,
        `/customers/${customerId}/googleAds:search`,
        {
          method: "POST",
          body: JSON.stringify({
            query: "SELECT customer.id, customer.descriptive_name, customer.manager FROM customer LIMIT 1",
          }),
        }
      );
      const customer = detail.results?.[0]?.customer;
      customers.push({
        id: customerId,
        name: customer?.descriptiveName ?? customerId,
        manager: Boolean(customer?.manager),
      });
    } catch {
      customers.push({ id: customerId, name: customerId, manager: false });
    }
  }

  return customers.sort((a, b) => a.name.localeCompare(b.name));
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

  const env = getGoogleOAuthConfig();

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
  await prisma.company.update({
    where: { id: companyId },
    data: {
      googleAdsCustomerId: normalizeCustomerId(customerId),
      googleAdsCustomerName: customerName,
      googleAdsLoginCustomerId: loginCustomerId
        ? normalizeCustomerId(loginCustomerId)
        : null,
      googleAdsConnectedAt: new Date(),
    },
  });
}

export async function getGoogleAdsSummary(
  companyId: string,
  days = 30
): Promise<GoogleAdsSummary> {
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

  const accessToken = await getGoogleAdsAccessToken(companyId);
  const customerId = normalizeCustomerId(company.googleAdsCustomerId);
  const range = days === 7 ? "LAST_7_DAYS" : days === 90 ? "LAST_90_DAYS" : "LAST_30_DAYS";

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
    `/customers/${customerId}/googleAds:search`,
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
          WHERE segments.date DURING ${range}
            AND campaign.status != 'REMOVED'
          ORDER BY metrics.cost_micros DESC
          LIMIT 100
        `,
      }),
    },
    company.googleAdsLoginCustomerId
  );

  const campaigns: GoogleAdsCampaignRow[] = (data.results ?? []).map((row) => ({
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

  const spend = campaigns.reduce((sum, row) => sum + row.spend, 0);
  const impressions = campaigns.reduce((sum, row) => sum + row.impressions, 0);
  const clicks = campaigns.reduce((sum, row) => sum + row.clicks, 0);
  const conversions = campaigns.reduce((sum, row) => sum + row.conversions, 0);
  const conversionsValue = campaigns.reduce((sum, row) => sum + row.conversionsValue, 0);
  const activeCampaigns = campaigns.filter((row) => row.status === "ENABLED").length;

  return {
    customerId,
    customerName: company.googleAdsCustomerName ?? customerId,
    days,
    spend,
    impressions,
    clicks,
    conversions,
    conversionsValue,
    activeCampaigns,
    campaigns,
  };
}
