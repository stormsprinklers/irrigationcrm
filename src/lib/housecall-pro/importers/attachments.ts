import { createHash } from "crypto";
import { HcpEntityType } from "@prisma/client";
import {
  ATTACHMENT_BATCH_SIZE,
  HCP_ATTACHMENT_PATHS,
  HCP_PARENT_DETAIL_PATHS,
} from "@/lib/housecall-pro/constants";
import type { BatchResult, ImportContext, HcpRecord } from "@/lib/housecall-pro/types";
import {
  countMappedParents,
  listMappedParents,
  upsertMapping,
} from "@/lib/housecall-pro/mapping";
import { hcpId, hcpString } from "@/lib/housecall-pro/utils";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import { prisma } from "@/lib/prisma";

type AttachmentParentType = "customers" | "jobs" | "estimates";

const ATTACHMENT_ARRAY_KEYS = [
  "attachments",
  "files",
  "photos",
  "images",
  "documents",
  "job_attachments",
  "estimate_attachments",
  "customer_attachments",
] as const;

function parseAttachmentCursor(cursor: string | null) {
  const offset = Number(cursor ?? "0");
  return Number.isFinite(offset) ? offset : 0;
}

function attachmentFileUrl(attachment: HcpRecord): string | null {
  return (
    hcpString(attachment.url) ??
    hcpString(attachment.download_url) ??
    hcpString(attachment.file_url) ??
    hcpString(attachment.signed_url) ??
    hcpString(attachment.href) ??
    hcpString(attachment.link)
  );
}

function extractAttachmentItems(data: HcpRecord): HcpRecord[] {
  const items: HcpRecord[] = [];
  for (const key of ATTACHMENT_ARRAY_KEYS) {
    const value = data[key];
    if (Array.isArray(value)) {
      items.push(...(value as HcpRecord[]));
    }
  }
  if (Array.isArray(data.links)) {
    for (const link of data.links as HcpRecord[]) {
      const type = hcpString(link.type)?.toLowerCase();
      if (!type || type === "file" || type === "link") {
        items.push(link);
      }
    }
  }
  if (Array.isArray(data.data)) {
    items.push(...(data.data as HcpRecord[]));
  }
  return items;
}

function dedupeAttachments(items: HcpRecord[]): HcpRecord[] {
  const seen = new Set<string>();
  const unique: HcpRecord[] = [];
  for (const item of items) {
    const id = hcpId(item);
    const url = attachmentFileUrl(item);
    const key = id || url;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

function stableAttachmentId(attachment: HcpRecord, fileUrl: string): string {
  const id = hcpId(attachment);
  if (id) return id;
  return createHash("sha256").update(fileUrl).digest("hex").slice(0, 16);
}

async function fetchAttachments(
  ctx: ImportContext,
  parentType: AttachmentParentType,
  parentHcpId: string
): Promise<HcpRecord[]> {
  const items: HcpRecord[] = [];

  for (const path of HCP_ATTACHMENT_PATHS[parentType](parentHcpId)) {
    try {
      const data = await ctx.client.get<HcpRecord>(path);
      items.push(...extractAttachmentItems(data));
    } catch {
      // try next path shape
    }
  }

  if (!items.length) {
    for (const path of HCP_PARENT_DETAIL_PATHS[parentType](parentHcpId)) {
      try {
        const data = await ctx.client.get<HcpRecord>(path);
        items.push(...extractAttachmentItems(data));
        if (items.length) break;
      } catch {
        // try next path shape
      }
    }
  }

  return dedupeAttachments(items);
}

async function importAttachmentFile(params: {
  ctx: ImportContext;
  parentHcpId: string;
  parentLocalId: string;
  parentType: AttachmentParentType;
  entityType: HcpEntityType;
  attachment: HcpRecord;
  blobPrefix: string;
  createRecord: (data: {
    blobUrl: string;
    fileName: string;
    mimeType: string;
  }) => Promise<void>;
  result: BatchResult;
}) {
  const fileUrl = attachmentFileUrl(params.attachment);
  if (!fileUrl) {
    params.result.skipped++;
    return;
  }

  const attachmentId = stableAttachmentId(params.attachment, fileUrl);
  const fileName =
    hcpString(params.attachment.file_name) ??
    hcpString(params.attachment.name) ??
    hcpString(params.attachment.fileName) ??
    `attachment-${attachmentId}`;

  const mappingKey = `${params.parentType}:${params.parentHcpId}:${attachmentId}`;
  const existing = await prisma.hcpEntityMapping.findUnique({
    where: {
      companyId_entityType_hcpId: {
        companyId: params.ctx.companyId,
        entityType: params.entityType,
        hcpId: mappingKey,
      },
    },
  });
  if (existing) {
    params.result.updated++;
    return;
  }

  const { buffer, contentType } = await params.ctx.client.downloadBinary(fileUrl);
  const pathname = `${params.blobPrefix}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const blob = await uploadPrivateBlob(pathname, buffer, { contentType });

  await params.createRecord({
    blobUrl: blob.url,
    fileName,
    mimeType: contentType,
  });

  await upsertMapping({
    companyId: params.ctx.companyId,
    migrationId: params.ctx.migrationId,
    entityType: params.entityType,
    hcpId: mappingKey,
    localId: blob.url,
    metadataJson: { parentLocalId: params.parentLocalId },
  });
  params.result.created++;
}

async function importParentAttachmentsBatch(params: {
  ctx: ImportContext;
  parentEntityType: HcpEntityType;
  parentType: AttachmentParentType;
  blobPrefix: string;
  createRecord: (
    parentLocalId: string,
    data: { blobUrl: string; fileName: string; mimeType: string }
  ) => Promise<void>;
}): Promise<BatchResult> {
  const result: BatchResult = {
    done: false,
    cursor: params.ctx.cursor,
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const offset = parseAttachmentCursor(params.ctx.cursor);
  const mappedParents = await listMappedParents(
    params.ctx.companyId,
    params.parentEntityType,
    offset,
    ATTACHMENT_BATCH_SIZE
  );

  if (!params.ctx.cursor) {
    const total = await countMappedParents(params.ctx.companyId, params.parentEntityType);
    await prisma.housecallProMigrationStep.updateMany({
      where: { migrationId: params.ctx.migrationId, step: params.ctx.step },
      data: { totalEstimate: total },
    });
  }

  for (const parent of mappedParents) {
    result.processed++;
    try {
      const attachments = await fetchAttachments(params.ctx, params.parentType, parent.hcpId);
      for (const attachment of attachments) {
        try {
          await importAttachmentFile({
            ctx: params.ctx,
            parentHcpId: parent.hcpId,
            parentLocalId: parent.localId,
            parentType: params.parentType,
            entityType: HcpEntityType.ATTACHMENT,
            attachment,
            blobPrefix: params.blobPrefix.replace("{id}", parent.localId),
            createRecord: async (data) => params.createRecord(parent.localId, data),
            result,
          });
        } catch (err) {
          result.failed++;
          result.errors.push(err instanceof Error ? err.message : "Attachment file failed");
        }
      }
    } catch (err) {
      result.failed++;
      result.errors.push(err instanceof Error ? err.message : "Attachment batch failed");
    }
  }

  const nextOffset = offset + mappedParents.length;
  const total = await countMappedParents(params.ctx.companyId, params.parentEntityType);
  result.cursor = String(nextOffset);
  result.done = nextOffset >= total;
  return result;
}

export async function importCustomerAttachmentsBatch(ctx: ImportContext): Promise<BatchResult> {
  return importParentAttachmentsBatch({
    ctx,
    parentEntityType: HcpEntityType.CUSTOMER,
    parentType: "customers",
    blobPrefix: `customers/${ctx.companyId}/{id}`,
    createRecord: async (customerId, data) => {
      await prisma.customerAttachment.create({
        data: {
          customerId,
          uploadedById: ctx.adminUserId,
          blobUrl: data.blobUrl,
          fileName: data.fileName,
          mimeType: data.mimeType,
        },
      });
    },
  });
}

export async function importJobAttachmentsBatch(ctx: ImportContext): Promise<BatchResult> {
  return importParentAttachmentsBatch({
    ctx,
    parentEntityType: HcpEntityType.VISIT,
    parentType: "jobs",
    blobPrefix: `visits/${ctx.companyId}/{id}`,
    createRecord: async (visitId, data) => {
      await prisma.visitAttachment.create({
        data: {
          visitId,
          uploadedById: ctx.adminUserId,
          blobUrl: data.blobUrl,
          fileName: data.fileName,
          mimeType: data.mimeType,
        },
      });
    },
  });
}

export async function importEstimateAttachmentsBatch(ctx: ImportContext): Promise<BatchResult> {
  return importParentAttachmentsBatch({
    ctx,
    parentEntityType: HcpEntityType.ESTIMATE,
    parentType: "estimates",
    blobPrefix: `estimates/${ctx.companyId}/{id}`,
    createRecord: async (estimateId, data) => {
      await prisma.estimateAttachment.create({
        data: {
          estimateId,
          blobUrl: data.blobUrl,
          fileName: data.fileName,
          mimeType: data.mimeType,
        },
      });
    },
  });
}
