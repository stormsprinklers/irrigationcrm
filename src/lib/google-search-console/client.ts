import {
  createOAuthState,
  exchangeOAuthCode,
  getGoogleOAuthConfig,
  isGoogleBusinessConfigured,
  verifyOAuthState,
} from "@/lib/google-business/client";
import type {
  GscAnalyticsRow,
  GscConnectionStatus,
  GscDashboardData,
  GscOverview,
  GscPageRow,
  GscQueryRow,
  GscSitemap,
  GscSite,
} from "@/lib/google-search-console/types";
import { SEARCH_CONSOLE_SCOPE } from "@/lib/google-search-console/types";
import { prisma } from "@/lib/prisma";

const WEBMASTERS_API = "https://www.googleapis.com/webmasters/v3";
const SEARCH_ANALYTICS_API = "https://searchconsole.googleapis.com/webmasters/v3";

export class GoogleSearchConsoleApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export function isSearchConsoleConfigured() {
  return isGoogleBusinessConfigured();
}

export function buildSearchConsoleAuthUrl(companyId: string, redirectUri: string) {
  const { clientId } = getGoogleOAuthConfig();
  if (!clientId) throw new GoogleSearchConsoleApiError("Google OAuth is not configured", 503);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SEARCH_CONSOLE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: createOAuthState(companyId),
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export { exchangeOAuthCode, verifyOAuthState };

function encodeSiteUrl(siteUrl: string) {
  return encodeURIComponent(siteUrl);
}

function formatGscDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateRange(days: number) {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(1, days - 1));
  return {
    startDate: formatGscDate(start),
    endDate: formatGscDate(end),
  };
}

export async function getSearchConsoleAccessToken(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { googleSearchConsoleRefreshToken: true },
  });

  if (!company?.googleSearchConsoleRefreshToken) {
    throw new GoogleSearchConsoleApiError("Google Search Console is not connected", 400);
  }

  const { clientId, clientSecret } = getGoogleOAuthConfig();
  if (!clientId || !clientSecret) {
    throw new GoogleSearchConsoleApiError("Google OAuth is not configured", 503);
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: company.googleSearchConsoleRefreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw new GoogleSearchConsoleApiError(
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
    const message = data.error?.message ?? `Google Search Console API error (${res.status})`;
    throw new GoogleSearchConsoleApiError(message, res.status);
  }

  return data;
}

function mapAnalyticsRow(row: {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}): GscAnalyticsRow {
  return {
    keys: row.keys ?? [],
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  };
}

export async function listSearchConsoleSites(companyId: string): Promise<GscSite[]> {
  const accessToken = await getSearchConsoleAccessToken(companyId);
  const data = await googleFetch<{ siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }> }>(
    accessToken,
    `${WEBMASTERS_API}/sites`
  );

  return (data.siteEntry ?? [])
    .filter((site) => site.siteUrl)
    .map((site) => ({
      siteUrl: site.siteUrl!,
      permissionLevel: site.permissionLevel ?? "unknown",
    }))
    .sort((a, b) => a.siteUrl.localeCompare(b.siteUrl));
}

async function querySearchAnalytics(
  accessToken: string,
  siteUrl: string,
  body: Record<string, unknown>
) {
  return googleFetch<{ rows?: Array<Record<string, unknown>> }>(
    accessToken,
    `${SEARCH_ANALYTICS_API}/sites/${encodeSiteUrl(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
}

async function fetchOverview(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  pagesWithImpressions: number
): Promise<GscOverview> {
  const data = await querySearchAnalytics(accessToken, siteUrl, {
    startDate,
    endDate,
    rowLimit: 1,
  });

  const row = mapAnalyticsRow(data.rows?.[0] ?? {});

  return {
    siteUrl,
    startDate,
    endDate,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
    pagesWithImpressions,
  };
}

async function fetchQueries(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  rowLimit = 50
): Promise<GscQueryRow[]> {
  const data = await querySearchAnalytics(accessToken, siteUrl, {
    startDate,
    endDate,
    dimensions: ["query"],
    rowLimit,
  });

  return (data.rows ?? []).map((raw) => {
    const row = mapAnalyticsRow(raw);
    return {
      query: row.keys[0] ?? "",
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    };
  });
}

async function fetchPages(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  rowLimit = 50
): Promise<GscPageRow[]> {
  const data = await querySearchAnalytics(accessToken, siteUrl, {
    startDate,
    endDate,
    dimensions: ["page"],
    rowLimit,
  });

  return (data.rows ?? []).map((raw) => {
    const row = mapAnalyticsRow(raw);
    return {
      page: row.keys[0] ?? "",
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    };
  });
}

async function fetchPagesCount(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string
) {
  const data = await querySearchAnalytics(accessToken, siteUrl, {
    startDate,
    endDate,
    dimensions: ["page"],
    rowLimit: 25000,
  });

  return data.rows?.length ?? 0;
}

async function fetchSitemaps(accessToken: string, siteUrl: string): Promise<GscSitemap[]> {
  try {
    const data = await googleFetch<{
      sitemap?: Array<{
        path?: string;
        lastSubmitted?: string;
        isPending?: boolean;
        lastDownloaded?: string;
        warnings?: number;
        errors?: number;
      }>;
    }>(accessToken, `${WEBMASTERS_API}/sites/${encodeSiteUrl(siteUrl)}/sitemaps`);

    return (data.sitemap ?? []).map((item) => ({
      path: item.path ?? "",
      lastSubmitted: item.lastSubmitted ?? null,
      isPending: item.isPending,
      lastDownloaded: item.lastDownloaded ?? null,
      warnings: item.warnings ?? 0,
      errors: item.errors ?? 0,
    }));
  } catch {
    return [];
  }
}

export async function getSearchConsoleDashboard(
  companyId: string,
  days = 30
): Promise<GscDashboardData> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { googleSearchConsoleSiteUrl: true },
  });

  const siteUrl = company?.googleSearchConsoleSiteUrl;
  if (!siteUrl) {
    throw new GoogleSearchConsoleApiError("Select a Search Console property", 400);
  }

  const accessToken = await getSearchConsoleAccessToken(companyId);
  const { startDate, endDate } = dateRange(days);

  const [pages, pagesWithImpressions, queries, sitemaps] = await Promise.all([
    fetchPages(accessToken, siteUrl, startDate, endDate, 50),
    fetchPagesCount(accessToken, siteUrl, startDate, endDate),
    fetchQueries(accessToken, siteUrl, startDate, endDate, 50),
    fetchSitemaps(accessToken, siteUrl),
  ]);

  const overview = await fetchOverview(
    accessToken,
    siteUrl,
    startDate,
    endDate,
    pagesWithImpressions
  );

  return { overview, queries, pages, sitemaps };
}

export async function getGscConnectionStatus(companyId: string): Promise<GscConnectionStatus | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      googleSearchConsoleRefreshToken: true,
      googleSearchConsoleSiteUrl: true,
      googleSearchConsoleConnectedAt: true,
    },
  });

  if (!company) return null;

  const env = getGoogleOAuthConfig();

  return {
    connected: Boolean(company.googleSearchConsoleRefreshToken),
    siteUrl: company.googleSearchConsoleSiteUrl,
    connectedAt: company.googleSearchConsoleConnectedAt?.toISOString() ?? null,
    configured: isSearchConsoleConfigured(),
    oauthEnv: {
      hasClientId: Boolean(env.clientId),
      hasClientSecret: Boolean(env.clientSecret),
    },
  };
}

export async function saveSearchConsoleSite(companyId: string, siteUrl: string) {
  await prisma.company.update({
    where: { id: companyId },
    data: { googleSearchConsoleSiteUrl: siteUrl },
  });
}

export function pickDefaultSite(sites: GscSite[], websiteUrl?: string | null) {
  if (!sites.length) return null;

  const normalizedWebsite = websiteUrl?.trim().toLowerCase();
  if (normalizedWebsite) {
    const host = normalizedWebsite
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/$/, "");

    const domainMatch = sites.find((site) =>
      site.siteUrl.toLowerCase().includes(`sc-domain:${host}`)
    );
    if (domainMatch) return domainMatch.siteUrl;

    const httpsMatch = sites.find((site) => {
      const lower = site.siteUrl.toLowerCase();
      return lower.includes(host) && lower.startsWith("http");
    });
    if (httpsMatch) return httpsMatch.siteUrl;
  }

  const fullAccess = sites.find((site) => site.permissionLevel === "siteFullUser");
  return fullAccess?.siteUrl ?? sites[0].siteUrl;
}
