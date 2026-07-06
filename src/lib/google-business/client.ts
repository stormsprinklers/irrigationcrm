import { Prisma } from "@prisma/client";
import type { GbpAccount, GbpCatalogCache, GbpLocation, GbpPerformanceSummary } from "@/lib/google-business/types";
import { GBP_METRIC_LABELS, GBP_PERFORMANCE_METRICS, GOOGLE_BUSINESS_SCOPE } from "@/lib/google-business/types";
import {
  getGoogleBusinessOAuthConfig,
  isGoogleBusinessOAuthConfigured,
  usesDedicatedGoogleBusinessOAuthCredentials,
} from "@/lib/google-oauth/config";
import {
  createOAuthState,
  exchangeGoogleOAuthCode,
  verifyOAuthState,
} from "@/lib/google-oauth/oauth";
import { prisma } from "@/lib/prisma";

const ACCOUNT_API = "https://mybusinessaccountmanagement.googleapis.com/v1";
const LOCATION_API = "https://mybusinessbusinessinformation.googleapis.com/v1";
const PERFORMANCE_API = "https://businessprofileperformance.googleapis.com/v1";
const GBP_CATALOG_TTL_MS = 30 * 60 * 1000;
const MAX_429_RETRIES = 4;

const inflightAccountLoads = new Map<string, Promise<GbpAccount[]>>();
const inflightLocationLoads = new Map<string, Promise<GbpLocation[]>>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isQuotaError(message: string) {
  return /quota exceeded/i.test(message);
}

export class GoogleBusinessApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export { createOAuthState, verifyOAuthState };

export function getGoogleOAuthConfig() {
  return getGoogleBusinessOAuthConfig();
}

export function isGoogleBusinessConfigured() {
  return isGoogleBusinessOAuthConfigured();
}

export function buildGoogleBusinessAuthUrl(companyId: string, redirectUri: string) {
  const { clientId } = getGoogleOAuthConfig();
  if (!clientId) throw new GoogleBusinessApiError("Google OAuth is not configured", 503);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_BUSINESS_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: createOAuthState(companyId),
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeOAuthCode(code: string, redirectUri: string) {
  return exchangeGoogleOAuthCode(
    code,
    redirectUri,
    getGoogleBusinessOAuthConfig(),
    GoogleBusinessApiError
  );
}

export async function getCompanyAccessToken(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { googleBusinessRefreshToken: true },
  });

  if (!company?.googleBusinessRefreshToken) {
    throw new GoogleBusinessApiError("Google Business Profile is not connected", 400);
  }

  const { clientId, clientSecret } = getGoogleBusinessOAuthConfig();
  if (!clientId || !clientSecret) {
    throw new GoogleBusinessApiError("Google OAuth is not configured", 503);
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: company.googleBusinessRefreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw new GoogleBusinessApiError(data.error ?? "Failed to refresh Google access token", res.status);
  }

  return data.access_token;
}

async function googleFetch<T>(accessToken: string, url: string, init?: RequestInit): Promise<T> {
  let attempt = 0;

  while (true) {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init?.headers ?? {}),
      },
    });

    const data = (await res.json()) as T & {
      error?: { message?: string; status?: string };
    };

    if (res.ok) return data;

    const message = data.error?.message ?? `Google API error (${res.status})`;

    if (res.status === 429 && attempt < MAX_429_RETRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(60_000, 2_000 * 2 ** attempt);
      attempt += 1;
      await sleep(delayMs);
      continue;
    }

    throw new GoogleBusinessApiError(message, res.status);
  }
}

export async function googleApiFetch<T>(accessToken: string, url: string, init?: RequestInit) {
  return googleFetch<T>(accessToken, url, init);
}

export async function googleApiFetchRaw(
  accessToken: string,
  url: string,
  init?: RequestInit
): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `Google API error (${res.status})`;
    try {
      const data = (await res.json()) as { error?: { message?: string } };
      message = data.error?.message ?? message;
    } catch {
      /* ignore */
    }
    throw new GoogleBusinessApiError(message, res.status);
  }
  return res;
}

export async function requireGbpCompany(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      googleBusinessAccountId: true,
      googleBusinessLocationId: true,
      googleBusinessLocationTitle: true,
      googleBusinessRefreshToken: true,
    },
  });

  if (!company?.googleBusinessRefreshToken) {
    throw new GoogleBusinessApiError("Google Business Profile is not connected", 400);
  }
  if (!company.googleBusinessAccountId || !company.googleBusinessLocationId) {
    throw new GoogleBusinessApiError("Select a Google Business Profile location first", 400);
  }

  return company;
}

function readCatalog(raw: unknown): GbpCatalogCache {
  if (!raw || typeof raw !== "object") return {};
  return raw as GbpCatalogCache;
}

async function loadCatalog(companyId: string): Promise<GbpCatalogCache> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { googleBusinessCatalogJson: true },
  });
  return readCatalog(company?.googleBusinessCatalogJson);
}

async function saveCatalog(companyId: string, catalog: GbpCatalogCache) {
  await prisma.company.update({
    where: { id: companyId },
    data: { googleBusinessCatalogJson: catalog as Prisma.InputJsonValue },
  });
}

function catalogFresh(iso: string | undefined, ttlMs = GBP_CATALOG_TTL_MS) {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < ttlMs;
}

export async function getGbpAccountsForCompany(
  companyId: string,
  options?: { refresh?: boolean }
) {
  const catalog = await loadCatalog(companyId);
  const cached = catalog.accounts ?? [];
  const fresh = catalogFresh(catalog.accountsFetchedAt);

  if (!options?.refresh && fresh) {
    return { accounts: cached, stale: false, fromCache: true };
  }

  const inflightKey = `${companyId}:accounts`;
  if (!options?.refresh && inflightAccountLoads.has(inflightKey)) {
    const accounts = await inflightAccountLoads.get(inflightKey)!;
    return { accounts, stale: false, fromCache: false };
  }

  const loadPromise = (async () => {
    const accessToken = await getCompanyAccessToken(companyId);
    const accounts = await listGbpAccounts(accessToken);
    const nextCatalog = await loadCatalog(companyId);
    await saveCatalog(companyId, {
      ...nextCatalog,
      accounts,
      accountsFetchedAt: new Date().toISOString(),
    });
    return accounts;
  })();

  inflightAccountLoads.set(inflightKey, loadPromise);
  try {
    const accounts = await loadPromise;
    return { accounts, stale: false, fromCache: false };
  } catch (err) {
    if (cached.length > 0) {
      const message = err instanceof Error ? err.message : "Failed to load accounts";
      return {
        accounts: cached,
        stale: true,
        fromCache: true,
        warning: isQuotaError(message)
          ? "Google API rate limit reached. Showing cached accounts — try Refresh from Google in a minute."
          : `${message} Showing cached accounts.`,
      };
    }
    throw err;
  } finally {
    inflightAccountLoads.delete(inflightKey);
  }
}

export async function getGbpLocationsForCompany(
  companyId: string,
  accountId: string,
  options?: { refresh?: boolean }
) {
  const catalog = await loadCatalog(companyId);
  const cached = catalog.locationsByAccount?.[accountId] ?? [];
  const fetchedAt = catalog.locationsFetchedAt?.[accountId];
  const fresh = catalogFresh(fetchedAt);

  if (!options?.refresh && fresh) {
    return { locations: cached, stale: false, fromCache: true };
  }

  const inflightKey = `${companyId}:locations:${accountId}`;
  if (!options?.refresh && inflightLocationLoads.has(inflightKey)) {
    const locations = await inflightLocationLoads.get(inflightKey)!;
    return { locations, stale: false, fromCache: false };
  }

  const loadPromise = (async () => {
    const accessToken = await getCompanyAccessToken(companyId);
    const locations = await listGbpLocations(accessToken, accountId);
    const nextCatalog = await loadCatalog(companyId);
    await saveCatalog(companyId, {
      ...nextCatalog,
      locationsByAccount: {
        ...(nextCatalog.locationsByAccount ?? {}),
        [accountId]: locations,
      },
      locationsFetchedAt: {
        ...(nextCatalog.locationsFetchedAt ?? {}),
        [accountId]: new Date().toISOString(),
      },
    });
    return locations;
  })();

  inflightLocationLoads.set(inflightKey, loadPromise);
  try {
    const locations = await loadPromise;
    return { locations, stale: false, fromCache: false };
  } catch (err) {
    if (cached.length > 0) {
      const message = err instanceof Error ? err.message : "Failed to load locations";
      return {
        locations: cached,
        stale: true,
        fromCache: true,
        warning: isQuotaError(message)
          ? "Google API rate limit reached. Showing cached locations — try Refresh from Google in a minute."
          : `${message} Showing cached locations.`,
      };
    }
    throw err;
  } finally {
    inflightLocationLoads.delete(inflightKey);
  }
}

export async function listGbpAccounts(accessToken: string): Promise<GbpAccount[]> {
  const accounts: GbpAccount[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams();
    if (pageToken) params.set("pageToken", pageToken);
    const query = params.toString();
    const data = await googleFetch<{
      accounts?: Array<{ name: string; accountName: string; type?: string }>;
      nextPageToken?: string;
    }>(accessToken, `${ACCOUNT_API}/accounts${query ? `?${query}` : ""}`);

    accounts.push(
      ...(data.accounts ?? []).map((account) => ({
        name: account.name,
        accountName: account.accountName,
        type: account.type,
      }))
    );
    pageToken = data.nextPageToken;
  } while (pageToken);

  return accounts;
}

export async function listGbpLocations(
  accessToken: string,
  accountName: string
): Promise<GbpLocation[]> {
  const parent = accountName.startsWith("accounts/") ? accountName : `accounts/${accountName}`;
  const locations: GbpLocation[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      readMask: "name,title,storefrontAddress",
      pageSize: "100",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const data = await googleFetch<{
      locations?: Array<{
        name: string;
        title?: string;
        storefrontAddress?: {
          addressLines?: string[];
          locality?: string;
          administrativeArea?: string;
          postalCode?: string;
        };
      }>;
      nextPageToken?: string;
    }>(accessToken, `${LOCATION_API}/${parent}/locations?${params.toString()}`);

    locations.push(
      ...(data.locations ?? []).map((location) => {
        const addr = location.storefrontAddress;
        const address = addr
          ? [addr.addressLines?.join(" "), addr.locality, addr.administrativeArea, addr.postalCode]
              .filter(Boolean)
              .join(", ")
          : null;
        return {
          name: location.name,
          title: location.title ?? location.name,
          address,
        };
      })
    );
    pageToken = data.nextPageToken;
  } while (pageToken);

  return locations;
}

function locationResourceId(locationId: string) {
  return locationId.startsWith("locations/") ? locationId : `locations/${locationId}`;
}

function parseDailyValue(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (value && typeof value === "object" && "value" in value) {
    return parseDailyValue((value as { value: unknown }).value);
  }
  return 0;
}

export async function fetchGbpPerformance(
  accessToken: string,
  locationId: string,
  locationTitle: string,
  days: number
): Promise<GbpPerformanceSummary> {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));

  const params = new URLSearchParams();
  for (const metric of GBP_PERFORMANCE_METRICS) {
    params.append("dailyMetrics", metric);
  }
  params.set("dailyRange.start_date.year", String(start.getFullYear()));
  params.set("dailyRange.start_date.month", String(start.getMonth() + 1));
  params.set("dailyRange.start_date.day", String(start.getDate()));
  params.set("dailyRange.end_date.year", String(end.getFullYear()));
  params.set("dailyRange.end_date.month", String(end.getMonth() + 1));
  params.set("dailyRange.end_date.day", String(end.getDate()));

  const resource = locationResourceId(locationId);
  const data = await googleFetch<{
    multiDailyMetricTimeSeries?: Array<{
      dailyMetricTimeSeries?: Array<{
        dailyMetric?: string;
        timeSeries?: {
          datedValues?: Array<{
            date?: { year?: number; month?: number; day?: number };
            value?: unknown;
          }>;
        };
      }>;
    }>;
  }>(
    accessToken,
    `${PERFORMANCE_API}/${resource}:fetchMultiDailyMetricsTimeSeries?${params.toString()}`
  );

  const metrics = (data.multiDailyMetricTimeSeries ?? []).flatMap((group) =>
    (group.dailyMetricTimeSeries ?? []).map((series) => {
      const metric = (series.dailyMetric ?? "WEBSITE_CLICKS") as keyof typeof GBP_METRIC_LABELS;
      const dailyValues = (series.timeSeries?.datedValues ?? []).map((point) => {
        const date = point.date;
        const iso = date?.year
          ? `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`
          : "";
        return { date: iso, value: parseDailyValue(point.value) };
      });
      const total = dailyValues.reduce((sum, row) => sum + row.value, 0);
      return {
        metric,
        label: GBP_METRIC_LABELS[metric] ?? metric,
        total,
        dailyValues,
      };
    })
  );

  const impressionMetrics = new Set([
    "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
    "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
    "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
    "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  ]);

  const impressions = metrics
    .filter((m) => impressionMetrics.has(m.metric))
    .reduce((sum, m) => sum + m.total, 0);
  const interactions = metrics
    .filter((m) => !impressionMetrics.has(m.metric))
    .reduce((sum, m) => sum + m.total, 0);

  return {
    locationId: resource,
    locationTitle,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    metrics,
    totals: { impressions, interactions },
  };
}

export async function getGbpConnectionStatus(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      googleBusinessRefreshToken: true,
      googleBusinessAccountId: true,
      googleBusinessLocationId: true,
      googleBusinessLocationTitle: true,
      googleBusinessConnectedAt: true,
    },
  });

  if (!company) return null;

  const env = getGoogleBusinessOAuthConfig();

  return {
    connected: Boolean(company.googleBusinessRefreshToken),
    accountId: company.googleBusinessAccountId,
    locationId: company.googleBusinessLocationId,
    locationTitle: company.googleBusinessLocationTitle,
    connectedAt: company.googleBusinessConnectedAt?.toISOString() ?? null,
    configured: isGoogleBusinessOAuthConfigured(),
    oauthEnv: {
      hasClientId: Boolean(env.clientId),
      hasClientSecret: Boolean(env.clientSecret),
      usesDedicatedCredentials: usesDedicatedGoogleBusinessOAuthCredentials(),
    },
  };
}
