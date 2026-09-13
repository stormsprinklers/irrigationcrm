/** Keep only email-safe hrefs. Merge tokens like `{booking_link}` are allowed. */
export function sanitizeEmailHref(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return "";
  if (/^\{[a-z_]+(?:\|[^}]*)?\}$/i.test(trimmed)) return trimmed;
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("#")) return trimmed;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

export function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function emailAnchorHtml(href: string, text: string): string | null {
  const safeHref = sanitizeEmailHref(href);
  if (!safeHref) return null;
  const label = text.trim() || safeHref;
  return `<a href="${escapeEmailHtml(safeHref)}" style="color:#1d4ed8;text-decoration:underline">${escapeEmailHtml(label)}</a>`;
}
