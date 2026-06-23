import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { getAuthSecret } from "@/lib/auth-secret";
import { PORTAL_SESSION_COOKIE, PORTAL_SESSION_MAX_AGE_SEC } from "./constants";

export type PortalSessionPayload = {
  type: "customer";
  customerId: string;
  companyId: string;
  exp: number;
};

function getSecret(): string {
  const secret = getAuthSecret();
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  return secret;
}

function sign(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("base64url");
}

export function encodePortalSession(payload: Omit<PortalSessionPayload, "type" | "exp">): string {
  const full: PortalSessionPayload = {
    type: "customer",
    ...payload,
    exp: Math.floor(Date.now() / 1000) + PORTAL_SESSION_MAX_AGE_SEC,
  };
  const data = Buffer.from(JSON.stringify(full)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function decodePortalSession(token: string): PortalSessionPayload | null {
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = sign(data);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as PortalSessionPayload;
    if (payload.type !== "customer" || !payload.customerId || !payload.companyId) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getPortalSession(): Promise<PortalSessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) return null;
  return decodePortalSession(token);
}

export function portalSessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: PORTAL_SESSION_MAX_AGE_SEC,
  };
}
