import { createHmac, timingSafeEqual } from "crypto";
import type { GbpAccount, GbpLocation, GbpPerformanceSummary } from "@/lib/google-business/types";
import { GBP_METRIC_LABELS, GBP_PERFORMANCE_METRICS, GOOGLE_BUSINESS_SCOPE } from "@/lib/google-business/types";
import { prisma } from "@/lib/prisma";

const ACCOUNT_API = "https://mybusinessaccountmanagement.googleapis.com/v1";
const LOCATION_API = "https://mybusinessbusinessinformation.googleapis.com/v1";
const PERFORMANCE_API = "https://businessprofileperformance.googleapis.com/v1";

export class GoogleBusinessApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export function getGoogleOAuthConfig() {
  const clientId =
    process.env.GOOGLE_OAUTH_CLIENT_ID ?? process.env.GOOGLE_CLOUD_CLIENT_ID ?? "";
  const clientSecret =
    process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? process.env.GOOGLE_CLOUD_CLIENT_SECRET ?? "";
  return { clientId, clientSecret };
}

export function isGoogleBusinessConfigured() {
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  return Boolean(clientId && clientSecret);
}

function oauthStateSecret() {
  return (
    process.env.GOOGLE_OAUTH_STATE_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    process.env.AUTH_SECRET ??
    "dev-only-secret-change-me"
  );
}

export function createOAuthState(companyId: string) {
  const ts = Date.now();
  const sig = createHmac("sha256", oauthStateSecret())
    .update(`${companyId}:${ts}`)
    .digest("hex");
  return Buffer.from(JSON.stringify({ companyId, ts, sig })).toString("base64url");
}

export function verifyOAuthState(state: string, maxAgeMs = 15 * 60 * 1000) {
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
      companyId: string;
      ts: number;
      sig: string;
    };
    if (!parsed.companyId || !parsed.ts || !parsed.sig) return null;
    if (Date.now() - parsed.ts > maxAgeMs) return null;

    const expected = createHmac("sha256", oauthStateSecret())
      .update(`${parsed.companyId}:${parsed.ts}`)
      .digest("hex");

    const a = Buffer.from(parsed.sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    return parsed.companyId;
  } catch {
    return null;
  }
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
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  if (!clientId || !clientSecret) {
    throw new GoogleBusinessApiError("Google OAuth is not configured", 503);
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !data.access_token) {
    throw new GoogleBusinessApiError(
      data.error_description ?? data.error ?? "OAuth token exchange failed",
      res.status
    );
  }

  return data;
}

export async function getCompanyAccessToken(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { googleBusinessRefreshToken: true },
  });

  if (!company?.googleBusinessRefreshToken) {
    throw new GoogleBusinessApiError("Google Business Profile is not connected", 400);
  }

  const { clientId, clientSecret } = getGoogleOAuthConfig();
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

async function googleFetch<T>(accessToken: string, url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new GoogleBusinessApiError(
      data.error?.message ?? `Google API error (${res.status})`,
      res.status
    );
  }

  return data;
}

export async function listGbpAccounts(accessToken: string): Promise<GbpAccount[]> {
  const data = await googleFetch<{ accounts?: Array<{ name: string; accountName: string; type?: string }> }>(
    accessToken,
    `${ACCOUNT_API}/accounts`
  );

  return (data.accounts ?? []).map((account) => ({
    name: account.name,
    accountName: account.accountName,
    type: account.type,
  }));
}

export async function listGbpLocations(
  accessToken: string,
  accountName: string
): Promise<GbpLocation[]> {
  const parent = accountName.startsWith("accounts/") ? accountName : `accounts/${accountName}`;
  const params = new URLSearchParams({
    readMask: "name,title,storefrontAddress",
    pageSize: "100",
  });

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
  }>(accessToken, `${LOCATION_API}/${parent}/locations?${params.toString()}`);

  return (data.locations ?? []).map((location) => {
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
  });
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

  return {
    connected: Boolean(company.googleBusinessRefreshToken),
    accountId: company.googleBusinessAccountId,
    locationId: company.googleBusinessLocationId,
    locationTitle: company.googleBusinessLocationTitle,
    connectedAt: company.googleBusinessConnectedAt?.toISOString() ?? null,
    configured: isGoogleBusinessConfigured(),
  };
}
