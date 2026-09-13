import { getAppBaseUrl } from "@/lib/app-url";

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

export function trackedClickUrl(recipientId: string, url: string) {
  return `${trackingBaseUrl()}/api/marketing/track/click?r=${encodeURIComponent(recipientId)}&u=${encodeURIComponent(url)}`;
}

export function trackedOpenUrl(recipientId: string) {
  return `${trackingBaseUrl()}/api/marketing/track/open?r=${encodeURIComponent(recipientId)}`;
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
      if (shouldSkipTrackedUrl(url)) return match;
      return `<a ${before}href="${trackedClickUrl(recipientId, url)}"${after}>`;
    }
  );
}

/** Wrap http(s) URLs in plain text so click tracking works without HTML. */
export function rewriteTrackedUrlsInText(text: string, recipientId: string) {
  if (!text) return text;
  return text.replace(/https?:\/\/[^\s<>"']+/gi, (raw) => {
    const trailing = raw.match(/[).,;:!?]+$/)?.[0] ?? "";
    const url = trailing ? raw.slice(0, -trailing.length) : raw;
    if (!url || shouldSkipTrackedUrl(url)) return raw;
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
