import type { HcpRecord } from "@/lib/housecall-pro/types";
import { hcpId, hcpString } from "@/lib/housecall-pro/utils";

/** Resolve a related entity ID from a scalar field or nested object. */
export function hcpRelatedId(record: HcpRecord, ...fields: string[]): string | null {
  for (const field of fields) {
    const value = record[field];
    if (value == null) continue;
    if (typeof value === "string" || typeof value === "number") {
      const text = String(value).trim();
      if (text) return text;
    }
    if (typeof value === "object") {
      const nested = hcpId(value as HcpRecord);
      if (nested) return nested;
    }
  }
  return null;
}

export const HCP_EXPAND_ATTACHMENTS = { "expand[]": "attachments" } as const;

export function attachmentsFromRecord(record: HcpRecord): HcpRecord[] {
  const attachments = record.attachments;
  if (Array.isArray(attachments)) {
    return attachments as HcpRecord[];
  }
  return [];
}

export function attachmentMimeType(attachment: HcpRecord, fallback: string): string {
  return (
    hcpString(attachment.file_type) ??
    hcpString(attachment.mime_type) ??
    hcpString(attachment.content_type) ??
    fallback
  );
}
