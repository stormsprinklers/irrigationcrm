import { getAuthSecret } from "@/lib/auth-secret";

export function getMobileJwtSecret(): Uint8Array {
  const secret = process.env.MOBILE_JWT_SECRET ?? getAuthSecret();
  if (!secret) {
    throw new Error("MOBILE_JWT_SECRET or AUTH_SECRET must be configured");
  }
  return new TextEncoder().encode(secret);
}
