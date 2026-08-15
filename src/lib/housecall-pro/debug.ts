import type { BatchResult, HcpRecord, MigrationDebugSample } from "@/lib/housecall-pro/types";
import { hcpId, hcpMoney, hcpString } from "@/lib/housecall-pro/utils";

export function emptyBatchResult(cursor: string | null): BatchResult {
  return {
    done: false,
    cursor,
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    debugSamples: [],
  };
}

export function pushDebug(
  result: BatchResult,
  sample: Omit<MigrationDebugSample, "at">,
  opts?: { enabled?: boolean }
) {
  if (opts?.enabled === false) return;
  if (!result.debugSamples) result.debugSamples = [];
  result.debugSamples.push({
    ...sample,
    at: new Date().toISOString(),
  });
  if (result.debugSamples.length > 50) {
    result.debugSamples = result.debugSamples.slice(-50);
  }
}

/** Record a human-readable import outcome for the debug UI. */
export function pushEntityDebug(
  result: BatchResult,
  opts: {
    enabled: boolean;
    action: MigrationDebugSample["action"];
    kind: string;
    record: HcpRecord;
    /** Extra fields shown prominently in the UI (name, zips, price, etc.). */
    fields?: Record<string, unknown>;
    previewUrl?: string | null;
    previewMimeType?: string | null;
    error?: string | null;
  }
) {
  pushDebug(
    result,
    {
      action: opts.action,
      label: debugLabelForRecord(opts.record, opts.kind),
      hcpId: hcpId(opts.record),
      detail: {
        ...(opts.fields ?? {}),
        ...summarizeHcpRecord(opts.record, 18),
      },
      previewUrl: opts.previewUrl ?? null,
      previewMimeType: opts.previewMimeType ?? null,
      error: opts.error ?? null,
    },
    { enabled: opts.enabled }
  );
}

const PREFERRED_KEYS = [
  "id",
  "uuid",
  "name",
  "first_name",
  "last_name",
  "display_name",
  "email",
  "phone",
  "mobile_number",
  "role",
  "status",
  "work_status",
  "summary_of_work",
  "work_summary",
  "job_summary",
  "summary",
  "notes",
  "number",
  "invoice_number",
  "estimate_number",
  "description",
  "sku",
  "part_number",
  "unit",
  "price",
  "unit_price",
  "amount",
  "cost",
  "unit_cost",
  "labor_rate",
  "labor_hours",
  "thumbnail",
  "image_url",
  "imageUrl",
  "file_name",
  "filename",
  "fileName",
  "title",
  "url",
  "download_url",
  "file_url",
  "mime_type",
  "content_type",
  "contentType",
  "street",
  "street_line_1",
  "city",
  "state",
  "zip",
  "zip_code",
  "zip_codes",
  "zips",
  "color",
  "color_hex",
  "scheduled_start",
  "schedule_start",
  "customer_id",
  "job_id",
  "company",
  "tags",
  "category",
  "category_name",
  "industry",
] as const;

function summarizeValue(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return typeof value === "string" && value.length > 240 ? `${value.slice(0, 240)}…` : value;
  }
  if (Array.isArray(value)) {
    if (
      value.length <= 20 &&
      value.every((v) => typeof v === "string" || typeof v === "number")
    ) {
      return value.map(String);
    }
    return `[${value.length} items]`;
  }
  if (typeof value === "object" && depth < 1) {
    return summarizeHcpRecord(value as HcpRecord, 8, depth + 1);
  }
  return "[object]";
}

export function summarizeHcpRecord(
  record: HcpRecord,
  maxKeys = 18,
  depth = 0
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of PREFERRED_KEYS) {
    if (record[key] === undefined || record[key] === null) continue;
    out[key] = summarizeValue(record[key], depth);
    if (Object.keys(out).length >= maxKeys) return out;
  }
  for (const [key, value] of Object.entries(record)) {
    if (out[key] !== undefined) continue;
    if (value == null) continue;
    if (typeof value === "object") continue;
    out[key] = summarizeValue(value, depth);
    if (Object.keys(out).length >= maxKeys) break;
  }
  return out;
}

export function debugLabelForRecord(record: HcpRecord, fallback = "Record"): string {
  const id = hcpId(record);
  const name =
    hcpString(record.name) ??
    hcpString(record.display_name) ??
    hcpString(record.file_name) ??
    hcpString(record.filename) ??
    hcpString(record.title) ??
    ([hcpString(record.first_name), hcpString(record.last_name)].filter(Boolean).join(" ") ||
      null) ??
    hcpString(record.email) ??
    hcpString(record.number) ??
    hcpString(record.invoice_number) ??
    hcpString(record.estimate_number);
  if (name && id) return `${name} (${id})`;
  if (name) return name;
  if (id) return `${fallback} ${id}`;
  return fallback;
}

export function priceFields(record: HcpRecord): Record<string, unknown> {
  return {
    price: hcpMoney(record.price ?? record.unit_price ?? record.amount),
    cost: hcpMoney(record.cost ?? record.unit_cost) || null,
    unit: hcpString(record.unit) ?? null,
    sku: hcpString(record.sku) ?? hcpString(record.part_number) ?? null,
    description: hcpString(record.description) ?? null,
  };
}

export function isLikelyImageMime(mime: string | null | undefined, url?: string | null) {
  if (mime && /^image\//i.test(mime)) return true;
  if (url && /\.(png|jpe?g|gif|webp|bmp|heic)(\?|$)/i.test(url)) return true;
  return false;
}
