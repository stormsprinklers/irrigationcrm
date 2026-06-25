export const SERPAPI_HOURLY_LIMIT = Number(process.env.SERPAPI_HOURLY_LIMIT ?? 50);
export const SERPAPI_MONTHLY_LIMIT = Number(process.env.SERPAPI_MONTHLY_LIMIT ?? 250);
export const SERPAPI_CACHE_TTL_HOURS = Number(process.env.SERPAPI_CACHE_TTL_HOURS ?? 24);

export type SerpApiQuotaSnapshot = {
  hourlyLimit: number;
  monthlyLimit: number;
  hourlyUsed: number;
  monthlyUsed: number;
  hourlyRemaining: number;
  monthlyRemaining: number;
};

function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export async function getSerpApiQuotaUsage(
  countSearches: (args: { since: Date }) => Promise<number>
): Promise<SerpApiQuotaSnapshot> {
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const monthStart = startOfUtcMonth(now);

  const [hourlyUsed, monthlyUsed] = await Promise.all([
    countSearches({ since: hourAgo }),
    countSearches({ since: monthStart }),
  ]);

  return {
    hourlyLimit: SERPAPI_HOURLY_LIMIT,
    monthlyLimit: SERPAPI_MONTHLY_LIMIT,
    hourlyUsed,
    monthlyUsed,
    hourlyRemaining: Math.max(0, SERPAPI_HOURLY_LIMIT - hourlyUsed),
    monthlyRemaining: Math.max(0, SERPAPI_MONTHLY_LIMIT - monthlyUsed),
  };
}

export function getAllowedSearchCount(quota: SerpApiQuotaSnapshot, requested: number) {
  const remaining = Math.min(quota.hourlyRemaining, quota.monthlyRemaining);
  return Math.max(0, Math.min(requested, remaining));
}

export function isCacheFresh(fetchedAt: Date, now = new Date()) {
  const ttlMs = SERPAPI_CACHE_TTL_HOURS * 60 * 60 * 1000;
  return now.getTime() - fetchedAt.getTime() < ttlMs;
}
