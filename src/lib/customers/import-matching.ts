export const clean = (value?: string | null) => value?.trim().replace(/\s+/g, " ") || null;
export const nameKey = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
const addressKey = (value?: string | null) =>
  (clean(value) ?? "").toLowerCase().replace(/[.,#]/g, " ").replace(/\b(street|st)\b/g, "st").replace(/\b(avenue|ave)\b/g, "ave").replace(/\b(road|rd)\b/g, "rd").replace(/\b(drive|dr)\b/g, "dr").replace(/\s+/g, " ").trim();
export const emailKey = (value?: string | null) => (clean(value) ?? "").toLowerCase();

export function validCustomerName(value?: string | null) {
  const name = clean(value);
  if (!name || !/\p{L}/u.test(name)) return false;
  return !/^(unknown(?: customer| name)?|n\/?a|none|no name|name unavailable|customer|test|unnamed)(?:[\s#-]*\d+)?$/i.test(name);
}

export function sameAddress(
  a: { address?: string | null; city?: string | null; state?: string | null; zip?: string | null },
  b: { address?: string | null; city?: string | null; state?: string | null; zip?: string | null }
) {
  if (!addressKey(a.address) || addressKey(a.address) !== addressKey(b.address)) return false;
  if (clean(a.zip) && clean(b.zip) && clean(a.zip) !== clean(b.zip)) return false;
  if (clean(a.city) && clean(b.city) && nameKey(a.city!) !== nameKey(b.city!)) return false;
  if (clean(a.state) && clean(b.state) && nameKey(a.state!) !== nameKey(b.state!)) return false;
  return true;
}
