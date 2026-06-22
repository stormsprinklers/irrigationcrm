const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? "";

export function rewriteTrackedLinks(html: string, recipientId: string) {
  if (!html) return html;
  return html.replace(
    /<a\s+([^>]*?)href=["']([^"']+)["']([^>]*)>/gi,
    (match, before, url, after) => {
      if (url.startsWith("mailto:") || url.startsWith("#") || url.includes("/api/marketing/track/click")) {
        return match;
      }
      const tracked = `${APP_URL()}/api/marketing/track/click?r=${encodeURIComponent(recipientId)}&u=${encodeURIComponent(url)}`;
      return `<a ${before}href="${tracked}"${after}>`;
    }
  );
}

export function htmlToPlainText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
