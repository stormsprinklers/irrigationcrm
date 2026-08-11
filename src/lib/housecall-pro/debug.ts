import type { BatchResult, HcpRecord, MigrationDebugSample } from "@/lib/housecall-pro/types";
import { hcpId, hcpString } from "@/lib/housecall-pro/utils";

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
  "status",
  "work_status",
  "number",
  "invoice_number",
  "estimate_number",
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
  "city",
  "state",
  "zip",
  "scheduled_start",
  "schedule_start",
  "customer_id",
  "job_id",
  "company",
  "tags",
] as const;

function summarizeValue(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return typeof value === "string" && value.length > 200 ? `${value.slice(0, 200)}…` : value;
  }
  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }
  if (typeof value === "object" && depth < 1) {
    return summarizeHcpRecord(value as HcpRecord, 6, depth + 1);
  }
  return "[object]";
}

export function summarizeHcpRecord(
  record: HcpRecord,
  maxKeys = 14,
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
