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

export type WebsiteFormResponse = {
  key: string;
  label: string;
  value: string;
};

const FORM_FIELD_CONTAINERS = new Set([
  "formfields",
  "customfields",
  "answers",
  "responses",
  "fielddata",
]);

const NON_RESPONSE_KEYS = new Set([
  "name",
  "fullname",
  "firstname",
  "lastname",
  "phone",
  "phonenumber",
  "email",
  "address",
  "city",
  "companyname",
  "role",
  "services",
  "message",
  "notes",
  "provider",
  "channel",
  "form",
  "facebookleadid",
  "leadconnectorcontactid",
  "metapageid",
  "metaformid",
  "metacampaignid",
  "metaadsetid",
  "metaadid",
  "leadgenid",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "fbc",
  "fbp",
  "useragent",
  "utmsource",
  "utmmedium",
  "utmcampaign",
  "utmcontent",
  "utmterm",
  "source",
  "medium",
  "campaign",
  "content",
  "term",
  "attribution",
  "tracking",
  "landingpage",
  "conversionpage",
  "sessionid",
]);

function normalizedKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function responseLabel(key: string) {
  const readable = key
    .replace(/^contact[._-]/i, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return readable ? readable.charAt(0).toUpperCase() + readable.slice(1) : "Response";
}

function responseValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const values = value
      .filter((item) => ["string", "number", "boolean"].includes(typeof item))
      .map((item) => String(item).trim())
      .filter(Boolean);
    return values.length ? values.join(", ") : null;
  }
  return null;
}

function isMetaInstantSource(source: string | null | undefined) {
  return /(?:meta|facebook).*(?:instant|lead|form)|(?:instant|lead|form).*(?:meta|facebook)/i.test(
    source ?? ""
  );
}

/** Flatten arbitrary Meta/GHL form-question answers into staff-readable rows. */
export function extractWebsiteFormResponses(
  metadata: unknown,
  source?: string | null
): WebsiteFormResponse[] {
  const meta = asRecord(metadata);
  if (!meta) return [];

  const responses: WebsiteFormResponse[] = [];
  const seen = new Set<string>();
  const add = (key: string, rawValue: unknown, label?: string) => {
    const normalized = normalizedKey(key);
    if (!normalized || NON_RESPONSE_KEYS.has(normalized) || seen.has(normalized)) return;
    const value = responseValue(rawValue);
    if (!value || /^\{\{.+\}\}$/.test(value)) return;
    seen.add(normalized);
    responses.push({ key, label: label?.trim() || responseLabel(key), value: value.slice(0, 2000) });
  };

  const collect = (value: unknown, depth = 0) => {
    if (depth > 3) return;
    if (Array.isArray(value)) {
      for (const item of value) {
        const row = asRecord(item);
        if (!row) continue;
        const key = asString(row.name) ?? asString(row.key) ?? asString(row.id);
        const label = asString(row.label) ?? asString(row.name) ?? key;
        const answer = row.values ?? row.value ?? row.field_value ?? row.fieldValue;
        if (key) add(key, answer, label ?? undefined);
      }
      return;
    }
    const record = asRecord(value);
    if (!record) return;
    for (const [key, answer] of Object.entries(record)) {
      const normalized = normalizedKey(key);
      if (FORM_FIELD_CONTAINERS.has(normalized)) {
        collect(answer, depth + 1);
      } else if (asRecord(answer) || (Array.isArray(answer) && !responseValue(answer))) {
        collect(answer, depth + 1);
      } else {
        add(key, answer);
      }
    }
  };

  for (const [key, value] of Object.entries(meta)) {
    if (FORM_FIELD_CONTAINERS.has(normalizedKey(key))) collect(value);
  }

  // Older Meta/GHL workflows commonly put custom answers directly in metadata.
  if (isMetaInstantSource(source)) collect(meta);

  return responses.slice(0, 60);
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
export function websiteFormDetailLines(metadata: unknown, source?: string | null): string[] {
  const details = extractWebsiteFormDetails(metadata);
  const responses = extractWebsiteFormResponses(metadata, source);
  const lines: string[] = [];
  if (details.companyName) lines.push(`Company: ${details.companyName}`);
  if (details.role) lines.push(`Role: ${details.role}`);
  if (details.services.length) {
    lines.push(`Services: ${details.services.join(", ")}`);
  }
  if (details.message) {
    lines.push(``, `Project details / message:`, details.message);
  }
  if (responses.length) {
    lines.push(``, `Form responses:`);
    lines.push(...responses.map((response) => `${response.label}: ${response.value}`));
  }
  return lines;
}
