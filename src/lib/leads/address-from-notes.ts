/**
 * Extract a service address from lead notes / metadata / form body text.
 * Website intake stores address as "Address: …" / "City: …" lines in notes.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function lineValue(text: string, label: RegExp): string | null {
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(label);
    if (match?.[1]) return match[1].trim() || null;
  }
  return null;
}

export type LeadServiceAddress = {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

export function parseLeadServiceAddress(
  notes?: string | null,
  metadata?: unknown,
  bodyText?: string | null
): LeadServiceAddress {
  const meta = asRecord(metadata) ?? {};
  const pricing = asRecord(meta.pricing_inputs) ?? asRecord(meta.pricingInputs) ?? {};

  const fromMeta: LeadServiceAddress = {
    address:
      asString(meta.address) ??
      asString(pricing.address) ??
      asString(meta.street) ??
      null,
    city: asString(meta.city) ?? asString(pricing.city) ?? null,
    state: asString(meta.state) ?? asString(pricing.state) ?? null,
    zip:
      asString(meta.zip) ??
      asString(meta.postal) ??
      asString(pricing.zip) ??
      asString(pricing.postal) ??
      null,
  };

  const blobs = [notes, bodyText].filter(Boolean).join("\n\n");
  const fromText: LeadServiceAddress = {
    address: blobs
      ? lineValue(blobs, /^Address\s*:\s*(.+)$/i) ??
        lineValue(blobs, /^Street\s*:\s*(.+)$/i)
      : null,
    city: blobs ? lineValue(blobs, /^City\s*:\s*(.+)$/i) : null,
    state: blobs
      ? lineValue(blobs, /^State\s*:\s*(.+)$/i) ??
        lineValue(blobs, /^ST\s*:\s*(.+)$/i)
      : null,
    zip: blobs
      ? lineValue(blobs, /^ZIP(?:\s*code)?\s*:\s*(.+)$/i) ??
        lineValue(blobs, /^Postal\s*:\s*(.+)$/i)
      : null,
  };

  return {
    address: fromMeta.address ?? fromText.address,
    city: fromMeta.city ?? fromText.city,
    state: fromMeta.state ?? fromText.state,
    zip: fromMeta.zip ?? fromText.zip,
  };
}

export function leadAddressQueryParams(addr: LeadServiceAddress): Record<string, string> {
  const params: Record<string, string> = {};
  if (addr.address) params.address = addr.address;
  if (addr.city) params.city = addr.city;
  if (addr.state) params.state = addr.state;
  if (addr.zip) params.zip = addr.zip;
  return params;
}
