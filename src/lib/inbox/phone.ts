/** Last 10 digits — US NANP key used for matching across formats. */
export function phoneDigitsKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return digits || null;
}

/**
 * Normalize to E.164. For now we assume all numbers are US (+1):
 * anything with ≥10 digits becomes +1 + last 10 digits.
 */
export function normalizePhone(phone: string) {
  const last10 = phoneDigitsKey(phone);
  if (last10 && last10.length === 10) return `+1${last10}`;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return phone.trim();
  return `+${digits}`;
}

/** True when two phone strings represent the same US number. */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined) {
  const left = phoneDigitsKey(a);
  const right = phoneDigitsKey(b);
  return Boolean(left && right && left === right && left.length === 10);
}

/** Common stored formats to try before a digit-stripping DB scan. */
export function phoneLookupVariants(phone: string): string[] {
  const normalized = normalizePhone(phone);
  const last10 = phoneDigitsKey(phone);
  const variants = new Set<string>([normalized, phone.trim()]);
  if (last10) {
    variants.add(last10);
    variants.add(`+1${last10}`);
    variants.add(`1${last10}`);
  }
  return [...variants].filter(Boolean);
}

export function formatPhoneDisplay(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}
