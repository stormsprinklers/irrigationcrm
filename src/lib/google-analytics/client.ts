/**
 * @deprecated GA4 CRM OAuth client — archived. API routes return 410. Use lib/marketing/website-analytics.ts.
 * See DEPRECATED.md in this folder.
 */
import {
  createOAuthState,
  exchangeOAuthCode,
  getGoogleOAuthConfig,
  isGoogleBusinessConfigured,
  verifyOAuthState,
} from "@/lib/google-business/client";
import type {
  Ga4ConnectionStatus,
  Ga4ConversionRow,
  Ga4DashboardData,
  Ga4Overview,
  Ga4PageRow,
  Ga4Property,
  Ga4Summary,
} from "@/lib/google-analytics/types";
import { GOOGLE_ANALYTICS_SCOPE } from "@/lib/google-analytics/types";
import { prisma } from "@/lib/prisma";

const ANALYTICS_ADMIN_API = "https://analyticsadmin.googleapis.com/v1beta";
const ANALYTICS_DATA_API = "https://analyticsdata.googleapis.com/v1beta";

export class GoogleAnalyticsApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export function isGoogleAnalyticsConfigured() {
  return isGoogleBusinessConfigured();
}

export function buildGoogleAnalyticsAuthUrl(companyId: string, redirectUri: string) {
  const { clientId } = getGoogleOAuthConfig();
  if (!clientId) throw new GoogleAnalyticsApiError("Google OAuth is not configured", 503);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_ANALYTICS_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: createOAuthState(companyId),
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export { exchangeOAuthCode, verifyOAuthState };

function formatGscStyleDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateRange(days: number) {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(1, days - 1));
  return {
    startDate: formatGscStyleDate(start),
    endDate: formatGscStyleDate(end),
  };
}

function gaDateRange(days: number) {
  return {
    startDate: `${Math.max(1, days - 1)}daysAgo`,
    endDate: "today",
  };
}

export async function getGoogleAnalyticsAccessToken(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { googleAnalyticsRefreshToken: true },
  });

  if (!company?.googleAnalyticsRefreshToken) {
    throw new GoogleAnalyticsApiError("Google Analytics is not connected", 400);
  }

  const { clientId, clientSecret } = getGoogleOAuthConfig();
  if (!clientId || !clientSecret) {
    throw new GoogleAnalyticsApiError("Google OAuth is not configured", 503);
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: company.googleAnalyticsRefreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw new GoogleAnalyticsApiError(
      data.error ?? "Failed to refresh Google access token",
      res.status
    );
  }

  return data.access_token;
}

async function googleFetch<T>(accessToken: string, url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const data = (await res.json()) as T & {
    error?: { message?: string; status?: string };
  };

  if (!res.ok) {
    const message = data.error?.message ?? `Google Analytics API error (${res.status})`;
    throw new GoogleAnalyticsApiError(message, res.status);
  }

  return data;
}

function parseMetricValue(row: { metricValues?: Array<{ value?: string }> } | undefined, index: number) {
  const raw = row?.metricValues?.[index]?.value;
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

function organicChannelFilter() {
  return {
    filter: {
      fieldName: "sessionDefaultChannelGroup",
      stringFilter: { matchType: "EXACT", value: "Organic Search" },
    },
  };
}

async function runReport(
  accessToken: string,
  propertyId: string,
  body: Record<string, unknown>
) {
  return googleFetch<{
    rows?: Array<{
      dimensionValues?: Array<{ value?: string }>;
      metricValues?: Array<{ value?: string }>;
    }>;
  }>(accessToken, `${ANALYTICS_DATA_API}/properties/${propertyId}:runReport`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function listGa4Properties(companyId: string): Promise<Ga4Property[]> {
  const accessToken = await getGoogleAnalyticsAccessToken(companyId);
  const data = await googleFetch<{
    accountSummaries?: Array<{
      displayName?: string;
      propertySummaries?: Array<{
        property?: string;
        displayName?: string;
      }>;
    }>;
  }>(accessToken, `${ANALYTICS_ADMIN_API}/accountSummaries?pageSize=200`);

  const properties: Ga4Property[] = [];
  for (const account of data.accountSummaries ?? []) {
    for (const property of account.propertySummaries ?? []) {
      if (!property.property) continue;
      const propertyId = property.property.replace(/^properties\//, "");
      properties.push({
        propertyId,
        displayName: property.displayName ?? propertyId,
        accountDisplayName: account.displayName ?? "",
      });
    }
  }

  return properties.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

async function fetchOverviewMetrics(
  accessToken: string,
  propertyId: string,
  days: number,
  dates: { startDate: string; endDate: string }
): Promise<Ga4Overview> {
  const range = gaDateRange(days);
  const metrics = [
    { name: "sessions" },
    { name: "conversions" },
    { name: "engagementRate" },
  ];

  const [totalData, organicData, organicConversionsData] = await Promise.all([
    runReport(accessToken, propertyId, {
      dateRanges: [range],
      metrics,
    }),
    runReport(accessToken, propertyId, {
      dateRanges: [range],
      metrics,
      dimensionFilter: organicChannelFilter(),
    }),
    runReport(accessToken, propertyId, {
      dateRanges: [range],
      metrics: [{ name: "conversions" }],
      dimensionFilter: organicChannelFilter(),
    }),
  ]);

  const totalRow = totalData.rows?.[0];
  const organicRow = organicData.rows?.[0];
  const organicConversionsRow = organicConversionsData.rows?.[0];

  return {
    propertyId,
    startDate: dates.startDate,
    endDate: dates.endDate,
    totalSessions: parseMetricValue(totalRow, 0),
    organicSessions: parseMetricValue(organicRow, 0),
    conversions: parseMetricValue(totalRow, 1),
    organicConversions: parseMetricValue(organicConversionsRow, 0),
    engagementRate: parseMetricValue(totalRow, 2),
  };
}

async function fetchTopPages(
  accessToken: string,
  propertyId: string,
  days: number
): Promise<Ga4PageRow[]> {
  const data = await runReport(accessToken, propertyId, {
    dateRanges: [gaDateRange(days)],
    dimensions: [{ name: "pagePath" }],
    metrics: [{ name: "screenPageViews" }, { name: "sessions" }],
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit: 50,
  });

  return (data.rows ?? []).map((row) => ({
    pagePath: row.dimensionValues?.[0]?.value ?? "",
    screenPageViews: parseMetricValue(row, 0),
    sessions: parseMetricValue(row, 1),
  }));
}

async function fetchConversionEvents(
  accessToken: string,
  propertyId: string,
  days: number
): Promise<Ga4ConversionRow[]> {
  const data = await runReport(accessToken, propertyId, {
    dateRanges: [gaDateRange(days)],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }, { name: "conversions" }],
    orderBys: [{ metric: { metricName: "conversions" }, desc: true }],
    limit: 25,
  });

  return (data.rows ?? [])
    .map((row) => ({
      eventName: row.dimensionValues?.[0]?.value ?? "",
      eventCount: parseMetricValue(row, 0),
      conversions: parseMetricValue(row, 1),
    }))
    .filter((row) => row.eventCount > 0 || row.conversions > 0);
}

export async function getGoogleAnalyticsDashboard(
  companyId: string,
  days = 30
): Promise<Ga4DashboardData> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { googleAnalyticsPropertyId: true },
  });

  const propertyId = company?.googleAnalyticsPropertyId;
  if (!propertyId) {
    throw new GoogleAnalyticsApiError("Select a Google Analytics property", 400);
  }

  const accessToken = await getGoogleAnalyticsAccessToken(companyId);
  const dates = dateRange(days);

  const [overview, pages, conversions] = await Promise.all([
    fetchOverviewMetrics(accessToken, propertyId, days, dates),
    fetchTopPages(accessToken, propertyId, days),
    fetchConversionEvents(accessToken, propertyId, days),
  ]);

  return { overview, pages, conversions };
}

export async function getGoogleAnalyticsSummary(
  companyId: string,
  days = 30
): Promise<Ga4Summary> {
  const status = await getGa4ConnectionStatus(companyId);
  if (!status?.connected || !status.propertyId) {
    return {
      connected: false,
      propertyId: null,
      organicConversions: null,
      totalConversions: null,
    };
  }

  try {
    const dashboard = await getGoogleAnalyticsDashboard(companyId, days);
    return {
      connected: true,
      propertyId: status.propertyId,
      organicConversions: dashboard.overview.organicConversions,
      totalConversions: dashboard.overview.conversions,
    };
  } catch {
    return {
      connected: true,
      propertyId: status.propertyId,
      organicConversions: null,
      totalConversions: null,
    };
  }
}

export async function getGa4ConnectionStatus(companyId: string): Promise<Ga4ConnectionStatus | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      googleAnalyticsRefreshToken: true,
      googleAnalyticsPropertyId: true,
      googleAnalyticsConnectedAt: true,
    },
  });

  if (!company) return null;

  const env = getGoogleOAuthConfig();

  return {
    connected: Boolean(company.googleAnalyticsRefreshToken),
    propertyId: company.googleAnalyticsPropertyId,
    connectedAt: company.googleAnalyticsConnectedAt?.toISOString() ?? null,
    configured: isGoogleAnalyticsConfigured(),
    oauthEnv: {
      hasClientId: Boolean(env.clientId),
      hasClientSecret: Boolean(env.clientSecret),
    },
  };
}

export async function saveGoogleAnalyticsProperty(companyId: string, propertyId: string) {
  await prisma.company.update({
    where: { id: companyId },
    data: { googleAnalyticsPropertyId: propertyId },
  });
}

function normalizeWebsiteHost(url: string) {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
}

export function pickDefaultGa4Property(properties: Ga4Property[], websiteUrl?: string | null) {
  if (!properties.length) return null;

  const host = websiteUrl ? normalizeWebsiteHost(websiteUrl) : "";
  if (host) {
    const match = properties.find(
      (property) =>
        property.displayName.toLowerCase().includes(host) ||
        host.includes(property.displayName.toLowerCase())
    );
    if (match) return match.propertyId;
  }

  return properties[0].propertyId;
}
