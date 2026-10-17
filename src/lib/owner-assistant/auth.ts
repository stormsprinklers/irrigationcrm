import { createHash, createHmac, timingSafeEqual } from "crypto";

const STREAM_AUDIENCE = "owner-assistant-stream";
const TOOL_AUDIENCE = "owner-assistant-tools";

function secret() {
  const value = process.env.OWNER_ASSISTANT_SECRET?.trim();
  if (!value) throw new Error("OWNER_ASSISTANT_SECRET is not configured");
  return value;
}

type BaseClaims = { aud: string; exp: number };
export type OwnerAssistantStreamClaims = BaseClaims & {
  configId: string;
  sessionId: string;
  callSid: string;
};
export type OwnerAssistantToolClaims = OwnerAssistantStreamClaims & { ownerUserId: string };

function encode(payload: Record<string, unknown>) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function decode<T extends BaseClaims>(token: string, audience: string): T | null {
  try {
    const [body, signature] = token.split(".");
    if (!body || !signature) return null;
    const expected = createHmac("sha256", secret()).update(body).digest("base64url");
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
    if (claims.aud !== audience || !claims.exp || Date.now() >= claims.exp) return null;
    return claims;
  } catch {
    return null;
  }
}

export function createOwnerAssistantStreamToken(
  claims: Omit<OwnerAssistantStreamClaims, "aud" | "exp">,
  ttlMs = 15 * 60 * 1000
) {
  return encode({ ...claims, aud: STREAM_AUDIENCE, exp: Date.now() + ttlMs });
}

export function verifyOwnerAssistantStreamToken(token: string) {
  return decode<OwnerAssistantStreamClaims>(token, STREAM_AUDIENCE);
}

export function createOwnerAssistantToolToken(
  claims: Omit<OwnerAssistantToolClaims, "aud" | "exp">,
  ttlMs = 45 * 60 * 1000
) {
  return encode({ ...claims, aud: TOOL_AUDIENCE, exp: Date.now() + ttlMs });
}

export function verifyOwnerAssistantToolToken(token: string) {
  return decode<OwnerAssistantToolClaims>(token, TOOL_AUDIENCE);
}

export function ownerAssistantBearer(header: string | null) {
  return header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
}

export function hashOwnerAssistantToolArgs(args: unknown) {
  return createHash("sha256").update(JSON.stringify(args ?? {})).digest("hex").slice(0, 32);
}

export function getOwnerAssistantWssUrl() {
  return normalizeOwnerAssistantWssUrl(
    process.env.OWNER_ASSISTANT_PUBLIC_WSS_URL?.trim() || ""
  );
}

export function normalizeOwnerAssistantWssUrl(rawValue: string) {
  let value = rawValue.trim();
  if (!value) return "";

  // Recover the common copy/paste form "wss://https://host".
  value = value.replace(/^wss:\/\/(https:\/\/)/i, "$1");
  if (/^https:\/\//i.test(value)) value = value.replace(/^https:/i, "wss:");
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(value)) value = `wss://${value}`;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "";
  }
  if (url.protocol !== "wss:" || !url.hostname || url.username || url.password) return "";
  if (!url.pathname || url.pathname === "/") url.pathname = "/twilio/media";
  url.hash = "";
  return url.toString();
}
