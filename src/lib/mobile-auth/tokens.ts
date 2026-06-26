import { createHash, randomBytes } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { getMobileJwtSecret } from "@/lib/mobile-auth/config";

const REFRESH_PREFIX = "crm_mob_";
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export type MobileAccessClaims = {
  sub: string;
  companyId: string;
  role: string;
  type: "mobile";
};

export function generateRefreshToken(): { rawToken: string; tokenHash: string } {
  const rawToken = `${REFRESH_PREFIX}${randomBytes(32).toString("hex")}`;
  return {
    rawToken,
    tokenHash: hashRefreshToken(rawToken),
  };
}

export function hashRefreshToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export async function signMobileAccessToken(claims: Omit<MobileAccessClaims, "type">) {
  const secret = getMobileJwtSecret();
  return new SignJWT({
    companyId: claims.companyId,
    role: claims.role,
    type: "mobile" as const,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifyMobileAccessToken(token: string): Promise<MobileAccessClaims | null> {
  try {
    const secret = getMobileJwtSecret();
    const { payload } = await jwtVerify(token, secret);
    if (payload.type !== "mobile") return null;
    const sub = payload.sub;
    const companyId = payload.companyId;
    const role = payload.role;
    if (typeof sub !== "string" || typeof companyId !== "string" || typeof role !== "string") {
      return null;
    }
    return { sub, companyId, role, type: "mobile" };
  } catch {
    return null;
  }
}

export function getRefreshTokenExpiry(): Date {
  const days = Number(process.env.MOBILE_REFRESH_DAYS ?? 30);
  const ttlDays = Number.isFinite(days) && days > 0 ? days : 30;
  return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
}

export const MOBILE_ACCESS_TOKEN_TTL_SECONDS = ACCESS_TOKEN_TTL_SECONDS;
