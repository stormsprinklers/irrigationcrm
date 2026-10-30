import { consumeSecurityRateLimit } from "@/lib/security/rate-limit";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 100;
export const AFFILIATE_DAILY_REQUEST_LIMIT = 150;

function localDateKey(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function safeTimeZone(timeZone: string | null | undefined) {
  const candidate = timeZone?.trim() || "UTC";
  try {
    localDateKey(Date.now(), candidate);
    return candidate;
  } catch {
    return "UTC";
  }
}

function secondsUntilNextLocalDay(timestamp: number, timeZone: string) {
  const today = localDateKey(timestamp, timeZone);
  let low = timestamp;
  let high = timestamp + 27 * 60 * 60 * 1000;
  while (high - low > 1000) {
    const middle = Math.floor((low + high) / 2);
    if (localDateKey(middle, timeZone) === today) low = middle;
    else high = middle;
  }
  return Math.max(1, Math.ceil((high - timestamp) / 1000));
}

export async function checkIntegrationRateLimit(
  credentialId: string
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  return consumeSecurityRateLimit(
    "integration:credential",
    credentialId,
    MAX_REQUESTS,
    { windowMs: WINDOW_MS, blockMs: WINDOW_MS }
  );
}

/** Shared across all keys owned by one affiliate; rotating a key cannot reset the quota. */
export async function checkAffiliateDailyRateLimit(
  affiliateUserId: string,
  companyTimeZone?: string | null
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const now = Date.now();
  const timeZone = safeTimeZone(companyTimeZone);
  const day = localDateKey(now, timeZone);
  const untilTomorrow = secondsUntilNextLocalDay(now, timeZone);
  const result = await consumeSecurityRateLimit(
    `affiliate:daily:${day}`,
    affiliateUserId,
    AFFILIATE_DAILY_REQUEST_LIMIT,
    { windowMs: 48 * 60 * 60 * 1000, blockMs: untilTomorrow * 1000 }
  );
  return result.allowed
    ? result
    : { allowed: false, retryAfterSeconds: Math.min(result.retryAfterSeconds, untilTomorrow) };
}
