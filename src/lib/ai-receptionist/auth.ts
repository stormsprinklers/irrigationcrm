import { createHmac, timingSafeEqual, createHash } from "crypto";

function receptionistSecret() {
  const secret =
    process.env.AI_RECEPTIONIST_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("AI_RECEPTIONIST_SECRET or NEXTAUTH_SECRET must be set");
  }
  return secret;
}

export function isAiReceptionistConfigured() {
  return Boolean(
    process.env.SIDEBAND_PUBLIC_WSS_URL?.trim() &&
      (process.env.AI_RECEPTIONIST_SECRET?.trim() ||
        process.env.NEXTAUTH_SECRET?.trim() ||
        process.env.AUTH_SECRET?.trim())
  );
}

export function getSidebandPublicWssUrl() {
  return process.env.SIDEBAND_PUBLIC_WSS_URL?.trim() || "";
}

export type ReceptionistStreamClaims = {
  companyId: string;
  callSid: string;
  flowId: string;
  nodeId: string;
  from: string;
  to?: string;
  callSessionId?: string;
  exp: number;
};

export type ReceptionistToolClaims = {
  companyId: string;
  callSid: string;
  receptionistCallId: string;
  exp: number;
};

function signPayload(payload: string) {
  return createHmac("sha256", receptionistSecret()).update(payload).digest("base64url");
}

function encodeToken(claims: Record<string, unknown>) {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const sig = signPayload(body);
  return `${body}.${sig}`;
}

function decodeToken<T extends { exp: number }>(token: string): T | null {
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const expected = signPayload(body);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
    if (!claims.exp || Date.now() > claims.exp) return null;
    return claims;
  } catch {
    return null;
  }
}

export function createStreamToken(
  claims: Omit<ReceptionistStreamClaims, "exp">,
  ttlMs = 15 * 60 * 1000
) {
  return encodeToken({ ...claims, exp: Date.now() + ttlMs });
}

export function verifyStreamToken(token: string) {
  return decodeToken<ReceptionistStreamClaims>(token);
}

export function createToolBearer(
  claims: Omit<ReceptionistToolClaims, "exp">,
  ttlMs = 30 * 60 * 1000
) {
  return encodeToken({ ...claims, exp: Date.now() + ttlMs });
}

export function verifyToolBearer(token: string) {
  return decodeToken<ReceptionistToolClaims>(token);
}

export function hashToolArgs(args: unknown) {
  return createHash("sha256").update(JSON.stringify(args ?? {})).digest("hex").slice(0, 32);
}

export function extractBearer(authorization: string | null) {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
