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

const ATTACHMENT_ARRAY_KEYS = [
  "attachments",
  "attachment",
  "files",
  "photos",
  "images",
  "documents",
  "media",
  "job_attachments",
  "estimate_attachments",
  "customer_attachments",
  "job_photos",
  "field_photos",
] as const;

const HCP_ENTITY_KEYS = {
  customers: ["customer", "customers"],
  jobs: ["job", "jobs"],
  estimates: ["estimate", "estimates"],
} as const;

export type HcpAttachmentParentType = keyof typeof HCP_ENTITY_KEYS;

function isHcpRecord(value: unknown): value is HcpRecord {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/** Unwrap `{ job: {...} }` style HCP detail responses. */
export function unwrapHcpEntityResponse(
  data: unknown,
  parentType?: HcpAttachmentParentType
): HcpRecord {
  if (!isHcpRecord(data)) return {};

  if (parentType) {
    for (const key of HCP_ENTITY_KEYS[parentType]) {
      const nested = data[key];
      if (isHcpRecord(nested)) return nested;
    }
  }

  for (const keys of Object.values(HCP_ENTITY_KEYS)) {
    for (const key of keys) {
      const nested = data[key];
      if (isHcpRecord(nested)) return nested;
    }
  }

  return data;
}

export function attachmentFileUrl(attachment: HcpRecord): string | null {
  const direct =
    hcpString(attachment.url) ??
    hcpString(attachment.download_url) ??
    hcpString(attachment.file_url) ??
    hcpString(attachment.signed_url) ??
    hcpString(attachment.href) ??
    hcpString(attachment.link) ??
    hcpString(attachment.source_url) ??
    hcpString(attachment.public_url) ??
    hcpString(attachment.original_url) ??
    hcpString(attachment.web_url);

  if (direct) return direct;

  if (isHcpRecord(attachment.file)) {
    const nested = attachmentFileUrl(attachment.file);
    if (nested) return nested;
  }

  if (isHcpRecord(attachment.attributes)) {
    const nested = attachmentFileUrl(attachment.attributes);
    if (nested) return nested;
  }

  return null;
}

function attachmentItemsFromRecord(record: HcpRecord): HcpRecord[] {
  const items: HcpRecord[] = [];
  for (const key of ATTACHMENT_ARRAY_KEYS) {
    const value = record[key];
    if (Array.isArray(value)) {
      items.push(...(value as HcpRecord[]));
    }
  }

  if (Array.isArray(record.links)) {
    for (const link of record.links as HcpRecord[]) {
      if (attachmentFileUrl(link)) {
        items.push(link);
      }
    }
  }

  return items;
}

/** Collect attachment records from any HCP list/detail response shape. */
export function collectAttachmentsFromResponse(
  data: unknown,
  parentType?: HcpAttachmentParentType
): HcpRecord[] {
  if (Array.isArray(data)) {
    return data.filter(isHcpRecord);
  }
  if (!isHcpRecord(data)) return [];

  const items: HcpRecord[] = [];
  items.push(...attachmentItemsFromRecord(data));

  const entity = unwrapHcpEntityResponse(data, parentType);
  if (entity !== data) {
    items.push(...attachmentItemsFromRecord(entity));
  }

  if (Array.isArray(data.data)) {
    items.push(...(data.data as HcpRecord[]));
  }
  if (isHcpRecord(data.data)) {
    items.push(...attachmentItemsFromRecord(data.data));
  }

  return items;
}

export function attachmentsFromRecord(record: HcpRecord): HcpRecord[] {
  return attachmentItemsFromRecord(record);
}

export function attachmentMimeType(attachment: HcpRecord, fallback: string): string {
  return (
    hcpString(attachment.file_type) ??
    hcpString(attachment.mime_type) ??
    hcpString(attachment.content_type) ??
    fallback
  );
}
