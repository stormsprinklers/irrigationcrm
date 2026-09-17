import {
  getGeneralGoogleOAuthConfig,
  isGeneralGoogleOAuthConfigured,
} from "@/lib/google-oauth/config";
import {
  createOAuthState,
  exchangeGoogleOAuthCode,
  verifyOAuthState,
} from "@/lib/google-oauth/oauth";
import type {
  GscAnalyticsRow,
  GscConnectionStatus,
  GscDashboardData,
  GscIndexCoverageData,
  GscNotIndexedPage,
  GscOverview,
  GscPageRow,
  GscQueryRow,
  GscSitemap,
  GscSite,
} from "@/lib/google-search-console/types";
import { SEARCH_CONSOLE_SCOPE } from "@/lib/google-search-console/types";
import { prisma } from "@/lib/prisma";
import { fetchSitemapPages } from "@/lib/marketing/sitemap-pages";
import { accessibleSites } from "./site-selection";
export { pickDefaultSite } from "./site-selection";

const WEBMASTERS_API = "https://www.googleapis.com/webmasters/v3";
const SEARCH_ANALYTICS_API = "https://searchconsole.googleapis.com/webmasters/v3";
const URL_INSPECTION_API = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const INDEX_COVERAGE_MAX_URLS = 150;
const INDEX_COVERAGE_CONCURRENCY = 5;
const LIVE_PAGE_TIMEOUT_MS = 12_000;

export class GoogleSearchConsoleApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export function isSearchConsoleConfigured() {
  return isGeneralGoogleOAuthConfigured();
}

export function buildSearchConsoleAuthUrl(companyId: string, redirectUri: string) {
  const { clientId } = getGeneralGoogleOAuthConfig();
  if (!clientId) throw new GoogleSearchConsoleApiError("Google OAuth is not configured", 503);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SEARCH_CONSOLE_SCOPE,
    access_type: "offline",
    prompt: "consent select_account",
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
    GoogleSearchConsoleApiError
  );
}

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

  const { clientId, clientSecret } = getGeneralGoogleOAuthConfig();
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

  return accessibleSites((data.siteEntry ?? [])
    .filter((site) => site.siteUrl)
    .map((site) => ({
      siteUrl: site.siteUrl!,
      permissionLevel: site.permissionLevel ?? "unknown",
    }))
    .sort((a, b) => a.siteUrl.localeCompare(b.siteUrl)));
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

function normalizeWebsiteUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).toString();
  } catch {
    return null;
  }
}

function normalizedHost(value: string) {
  return value.toLowerCase().replace(/^www\./, "");
}

function belongsToWebsite(pageUrl: string, websiteUrl: string) {
  try {
    const page = new URL(pageUrl);
    const website = new URL(websiteUrl);
    return (
      (page.protocol === "https:" || page.protocol === "http:") &&
      normalizedHost(page.hostname) === normalizedHost(website.hostname)
    );
  } catch {
    return false;
  }
}

function hasNoindexDirective(html: string, xRobotsTag: string | null) {
  if (/\bnoindex\b/i.test(xRobotsTag ?? "")) return true;
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const attributeValue = (tag: string, attribute: string) => {
    const match = tag.match(
      new RegExp(`\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")
    );
    return match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
  };
  return metaTags.some((tag) => {
    const name = attributeValue(tag, "name").toLowerCase();
    const content = attributeValue(tag, "content");
    return name === "robots" && /\bnoindex\b/i.test(content);
  });
}

type LiveIndexability = "indexable" | "noindex" | "unavailable";

async function getLiveIndexability(pageUrl: string): Promise<LiveIndexability> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIVE_PAGE_TIMEOUT_MS);
  try {
    const response = await fetch(pageUrl, {
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "StormCRM-Indexability-Check/1.0",
      },
    });
    if (!response.ok) return "unavailable";
    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) return "unavailable";
    const html = await response.text();
    return hasNoindexDirective(html, response.headers.get("x-robots-tag"))
      ? "noindex"
      : "indexable";
  } catch {
    return "unavailable";
  } finally {
    clearTimeout(timeout);
  }
}

async function inspectUrlIndexStatus(accessToken: string, siteUrl: string, inspectionUrl: string) {
  return googleFetch<{
    inspectionResult?: {
      indexStatusResult?: {
        coverageState?: string;
        verdict?: string;
        indexingState?: string;
        robotsTxtState?: string;
        pageFetchState?: string;
        lastCrawlTime?: string;
      };
    };
  }>(accessToken, URL_INSPECTION_API, {
    method: "POST",
    body: JSON.stringify({ inspectionUrl, siteUrl, languageCode: "en-US" }),
  });
}

function isIndexedByGoogle(status: {
  coverageState?: string;
  verdict?: string;
  indexingState?: string;
}) {
  const coverage = status.coverageState?.toLowerCase() ?? "";
  if (/not indexed|not on google|excluded|blocked/.test(coverage)) return false;
  return status.verdict === "PASS" && status.indexingState !== "BLOCKED_BY_META_TAG";
}

/**
 * Inspect live, sitemap-listed pages in Search Console. This intentionally
 * excludes pages carrying a current noindex directive before they reach the
 * report, even when Google has not recrawled that directive yet.
 */
export async function getSearchConsoleIndexCoverage(
  companyId: string
): Promise<GscIndexCoverageData> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      googleSearchConsoleSiteUrl: true,
      organicSearchWebsiteUrl: true,
      website: true,
    },
  });
  const siteUrl = company?.googleSearchConsoleSiteUrl;
  const websiteUrl =
    normalizeWebsiteUrl(company?.organicSearchWebsiteUrl) ?? normalizeWebsiteUrl(company?.website);
  if (!siteUrl) throw new GoogleSearchConsoleApiError("Select a Search Console property", 400);
  if (!websiteUrl) {
    throw new GoogleSearchConsoleApiError("Add a website URL to the company profile before checking index coverage", 400);
  }

  const accessToken = await getSearchConsoleAccessToken(companyId);
  const sitemaps = await fetchSitemaps(accessToken, siteUrl);
  const snapshot = await fetchSitemapPages({
    websiteUrl,
    sitemapPaths: sitemaps.map((sitemap) => sitemap.path),
    maxUrls: INDEX_COVERAGE_MAX_URLS,
  });
  if (!snapshot) {
    throw new GoogleSearchConsoleApiError("Could not read a live sitemap for this website", 502);
  }

  const sitemapUrls = snapshot.pageUrls.filter((url) => belongsToWebsite(url, websiteUrl));
  const liveChecks: Array<{ url: string; indexability: LiveIndexability }> = [];
  for (let index = 0; index < sitemapUrls.length; index += INDEX_COVERAGE_CONCURRENCY) {
    const batch = sitemapUrls.slice(index, index + INDEX_COVERAGE_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (url) => ({ url, indexability: await getLiveIndexability(url) }))
    );
    liveChecks.push(...results);
  }
  const indexableUrls = liveChecks
    .filter((page) => page.indexability === "indexable")
    .map((page) => page.url);
  const excludedNoindexCount = liveChecks.filter((page) => page.indexability === "noindex").length;
  const notIndexedPages: GscNotIndexedPage[] = [];
  let inspectionErrorCount = 0;

  for (let index = 0; index < indexableUrls.length; index += INDEX_COVERAGE_CONCURRENCY) {
    const batch = indexableUrls.slice(index, index + INDEX_COVERAGE_CONCURRENCY);
    const inspected = await Promise.all(
      batch.map(async (url) => {
        try {
          const response = await inspectUrlIndexStatus(accessToken, siteUrl, url);
          return { url, status: response.inspectionResult?.indexStatusResult ?? {} };
        } catch {
          inspectionErrorCount += 1;
          return null;
        }
      })
    );

    for (const result of inspected) {
      if (!result || isIndexedByGoogle(result.status)) continue;
      notIndexedPages.push({
        url: result.url,
        coverageState: result.status.coverageState ?? null,
        verdict: result.status.verdict ?? null,
        indexingState: result.status.indexingState ?? null,
        robotsTxtState: result.status.robotsTxtState ?? null,
        pageFetchState: result.status.pageFetchState ?? null,
        lastCrawlTime: result.status.lastCrawlTime ?? null,
      });
    }
  }

  return {
    siteUrl,
    sitemapUrl: snapshot.sourceUrl,
    discoveredCount: sitemapUrls.length,
    checkedCount: indexableUrls.length,
    excludedNoindexCount,
    inspectionErrorCount,
    truncated: snapshot.truncated,
    notIndexedPages: notIndexedPages.sort((a, b) => a.url.localeCompare(b.url)),
  };
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

  const [pages, pagesWithImpressions, queries, sitemaps, dailyResult, dailyPages] = await Promise.all([
    fetchPages(accessToken, siteUrl, startDate, endDate, 50),
    fetchPagesCount(accessToken, siteUrl, startDate, endDate),
    fetchQueries(accessToken, siteUrl, startDate, endDate, 50),
    fetchSitemaps(accessToken, siteUrl),
    querySearchAnalytics(accessToken, siteUrl, { startDate, endDate, dimensions: ["date"], rowLimit: 25000 }),
    querySearchAnalytics(accessToken, siteUrl, { startDate, endDate, dimensions: ["date", "page"], rowLimit: 25000 }),
  ]);

  const overview = await fetchOverview(
    accessToken,
    siteUrl,
    startDate,
    endDate,
    pagesWithImpressions
  );

  const pageCounts = new Map<string, number>();
  for (const raw of dailyPages.rows ?? []) {
    const row = mapAnalyticsRow(raw);
    if (row.impressions > 0) pageCounts.set(row.keys[0], (pageCounts.get(row.keys[0]) ?? 0) + 1);
  }
  const daily = (dailyResult.rows ?? []).map((raw) => {
    const row = mapAnalyticsRow(raw);
    return { date: row.keys[0], clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position, pagesWithImpressions: pageCounts.get(row.keys[0]) ?? 0 };
  }).sort((a,b) => a.date.localeCompare(b.date));
  return { overview, queries, pages, sitemaps, daily, pageTrendLimited: (dailyPages.rows?.length ?? 0) >= 25000 };
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

  const env = getGeneralGoogleOAuthConfig();

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
  const sites = await listSearchConsoleSites(companyId);
  if (!sites.some((site) => site.siteUrl === siteUrl)) {
    throw new GoogleSearchConsoleApiError("This Google account cannot access that exact property. Choose an available property, or reconnect with an account granted access in Search Console Settings > Users and permissions.", 403);
  }
  await prisma.company.update({
    where: { id: companyId },
    data: { googleSearchConsoleSiteUrl: siteUrl },
  });
}
