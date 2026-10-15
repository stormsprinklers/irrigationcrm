import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getAppBaseUrl } from "@/lib/app-url";
import { getAuthSecret } from "@/lib/auth-secret";

type TrackingKind = "open" | "click";
type TrackingPayload = { r: string; k: TrackingKind; e: number; u?: string };

const TRACKING_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function trackingSecret() {
  const secret = process.env.MARKETING_TRACKING_SECRET?.trim() || getAuthSecret()?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "local-marketing-tracking-secret";
  throw new Error("MARKETING_TRACKING_SECRET or AUTH_SECRET is required");
}

function destinationDigest(url: string) {
  return createHash("sha256").update(url).digest("base64url");
}

function signPayload(encoded: string) {
  return createHmac("sha256", trackingSecret()).update(encoded).digest("base64url");
}

export function createMarketingTrackingToken(
  recipientId: string,
  kind: TrackingKind,
  destination?: string,
  expiresAt = Date.now() + TRACKING_TTL_MS
) {
  const payload: TrackingPayload = {
    r: recipientId,
    k: kind,
    e: expiresAt,
    ...(destination ? { u: destinationDigest(destination) } : {}),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `v1.${encoded}.${signPayload(encoded)}`;
}

export function verifyMarketingTrackingToken(
  token: string,
  kind: TrackingKind,
  destination?: string,
  now = Date.now()
): string | null {
  try {
    const [version, encoded, signature, extra] = token.split(".");
    if (version !== "v1" || !encoded || !signature || extra) return null;
    const expected = Buffer.from(signPayload(encoded));
    const supplied = Buffer.from(signature);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TrackingPayload;
    if (!payload.r || payload.k !== kind || !Number.isFinite(payload.e) || payload.e <= now) return null;
    if (kind === "click") {
      if (!destination || !payload.u || payload.u !== destinationDigest(destination)) return null;
    }
    return payload.r;
  } catch {
    return null;
  }
}

function trackingBaseUrl() {
  return getAppBaseUrl().replace(/\/$/, "");
}

export function shouldSkipTrackedUrl(url: string) {
  return (
    url.startsWith("mailto:") ||
    url.startsWith("tel:") ||
    url.startsWith("#") ||
    url.includes("/api/marketing/track/click") ||
    url.includes("/api/marketing/unsubscribe") ||
    /\/portal\/[^/]+\/preferences/.test(url)
  );
}

export function safeTrackedDestination(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function trackedClickUrl(recipientId: string, url: string) {
  const destination = safeTrackedDestination(url);
  if (!destination) return url;
  const token = createMarketingTrackingToken(recipientId, "click", destination);
  return `${trackingBaseUrl()}/api/marketing/track/click?t=${encodeURIComponent(token)}&u=${encodeURIComponent(destination)}`;
}

export function trackedOpenUrl(recipientId: string) {
  const token = createMarketingTrackingToken(recipientId, "open");
  return `${trackingBaseUrl()}/api/marketing/track/open?t=${encodeURIComponent(token)}`;
}

export function appendOpenTrackingPixel(html: string, recipientId: string) {
  const src = trackedOpenUrl(recipientId);
  if (!html || html.includes("/api/marketing/track/open")) return html;
  return `${html}<img src="${src}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;outline:0" />`;
}

export function rewriteTrackedLinks(html: string, recipientId: string) {
  if (!html) return html;
  return html.replace(
    /<a\s+([^>]*?)href=["']([^"']+)["']([^>]*)>/gi,
    (match, before, url, after) => {
      const destination = url.replace(/&amp;/gi, "&");
      if (shouldSkipTrackedUrl(destination) || !safeTrackedDestination(destination)) return match;
      return `<a ${before}href="${trackedClickUrl(recipientId, destination)}"${after}>`;
    }
  );
}

/** Wrap http(s) URLs in plain text so click tracking works without HTML. */
export function rewriteTrackedUrlsInText(text: string, recipientId: string) {
  if (!text) return text;
  return text.replace(/https?:\/\/[^\s<>"']+/gi, (raw) => {
    const trailing = raw.match(/[).,;:!?]+$/)?.[0] ?? "";
    const url = trailing ? raw.slice(0, -trailing.length) : raw;
    if (!url || shouldSkipTrackedUrl(url) || !safeTrackedDestination(url)) return raw;
    return `${trackedClickUrl(recipientId, url)}${trailing}`;
  });
}

export function htmlToPlainText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
      const text = String(inner)
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .trim();
      if (!text || text === href) return String(href);
      return `${text} (${href})`;
    })
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
