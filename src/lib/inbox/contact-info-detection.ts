const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

const PHONE_RE = /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/;

const ADDRESS_CUE_RE =
  /\b(?:street|st\.?|avenue|ave\.?|road|rd\.?|drive|dr\.?|lane|ln\.?|blvd\.?|boulevard|court|ct\.?|way|circle|cir\.?|zip\s*\d{5}|address\s+is|live\s+at|located\s+at)\b/i;

const NAME_CUE_RE =
  /\b(?:my name is|this is|i'?m|i am|first name|last name|call me)\b/i;

/** Returns true when an inbound SMS likely shares contact details worth extracting. */
export function messageSharesContactInfo(body: string): boolean {
  const text = body.trim();
  if (!text || text === "[Media message]") return false;

  if (EMAIL_RE.test(text)) return true;

  const hasPhone = PHONE_RE.test(text);
  const hasAddressCue = ADDRESS_CUE_RE.test(text);
  const hasNameCue = NAME_CUE_RE.test(text);

  if (hasPhone && (hasAddressCue || hasNameCue)) return true;
  if (hasAddressCue && hasNameCue) return true;

  return false;
}

export function extractEmailFromMessage(body: string): string | null {
  const match = body.match(EMAIL_RE);
  return match?.[0] ?? null;
}
