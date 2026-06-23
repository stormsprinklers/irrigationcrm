import { createHash, randomBytes } from "crypto";

const KEY_PREFIX = "crm_int_";

export function generateIntegrationKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
  const secret = randomBytes(32).toString("hex");
  const rawKey = `${KEY_PREFIX}${secret}`;
  return {
    rawKey,
    keyHash: hashIntegrationKey(rawKey),
    keyPrefix: rawKey.slice(0, 16),
  };
}

export function hashIntegrationKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function extractIntegrationKey(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  const headerKey = request.headers.get("x-integration-key");
  if (headerKey?.trim()) return headerKey.trim();
  return null;
}
