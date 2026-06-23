const buckets = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 100;

export function checkIntegrationRateLimit(credentialId: string): boolean {
  const now = Date.now();
  const entry = buckets.get(credentialId);
  if (!entry || now >= entry.resetAt) {
    buckets.set(credentialId, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_REQUESTS) return false;
  entry.count += 1;
  return true;
}
