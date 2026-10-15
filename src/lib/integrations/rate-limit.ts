import { consumeSecurityRateLimit } from "@/lib/security/rate-limit";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 100;

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
