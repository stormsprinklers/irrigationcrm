/**
 * Shared helpers for flattening website form metadata into staff-visible text.
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

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export function extractWebsiteFormDetails(metadata: unknown): {
  companyName: string | null;
  role: string | null;
  services: string[];
  message: string | null;
} {
  const meta = asRecord(metadata) ?? {};
  const pricing =
    asRecord(meta.pricing_inputs) ?? asRecord(meta.pricingInputs) ?? {};

  const services = asStringList(meta.services).length
    ? asStringList(meta.services)
    : asStringList(pricing.services);

  return {
    companyName: asString(meta.companyName) ?? asString(pricing.companyName),
    role: asString(meta.role) ?? asString(pricing.role),
    services,
    message:
      asString(meta.message) ??
      asString(pricing.message) ??
      asString(meta.notes) ??
      null,
  };
}

/** Extra detail lines for inbox / email (company, role, services, message). */
export function websiteFormDetailLines(metadata: unknown): string[] {
  const details = extractWebsiteFormDetails(metadata);
  const lines: string[] = [];
  if (details.companyName) lines.push(`Company: ${details.companyName}`);
  if (details.role) lines.push(`Role: ${details.role}`);
  if (details.services.length) {
    lines.push(`Services: ${details.services.join(", ")}`);
  }
  if (details.message) {
    lines.push(``, `Project details / message:`, details.message);
  }
  return lines;
}
