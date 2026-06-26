import { createHash } from "crypto";
import { HcpEntityType } from "@prisma/client";
import {
  ATTACHMENT_BATCH_SIZE,
  HCP_ATTACHMENT_PATHS,
  HCP_PARENT_DETAIL_PATHS,
} from "@/lib/housecall-pro/constants";
import {
  attachmentFileUrl,
  attachmentMimeType,
  collectAttachmentsFromResponse,
  HCP_EXPAND_ATTACHMENTS,
  type HcpAttachmentParentType,
} from "@/lib/housecall-pro/expand";
import type { BatchResult, ImportContext, HcpRecord } from "@/lib/housecall-pro/types";
import {
  countMappedParents,
  listMappedParents,
  upsertMapping,
} from "@/lib/housecall-pro/mapping";
import { hcpId, hcpString } from "@/lib/housecall-pro/utils";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import { prisma } from "@/lib/prisma";

function parseAttachmentCursor(cursor: string | null) {
  const offset = Number(cursor ?? "0");
  return Number.isFinite(offset) ? offset : 0;
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
  parentType: HcpAttachmentParentType,
  parentHcpId: string
): Promise<HcpRecord[]> {
  const items: HcpRecord[] = [];
  const detailParams = [{ ...HCP_EXPAND_ATTACHMENTS }, {}];

  for (const path of HCP_PARENT_DETAIL_PATHS[parentType](parentHcpId)) {
    for (const params of detailParams) {
      try {
        const data = await ctx.client.get<HcpRecord>(path, { params });
        items.push(...collectAttachmentsFromResponse(data, parentType));
        if (items.length) return dedupeAttachments(items);
      } catch {
        // try next path / param set
      }
    }
  }

  for (const path of HCP_ATTACHMENT_PATHS[parentType](parentHcpId)) {
    try {
      const data = await ctx.client.get<HcpRecord>(path);
      items.push(...collectAttachmentsFromResponse(data, parentType));
    } catch {
      // try next path shape
    }
  }

  return dedupeAttachments(items);
}

async function importAttachmentFile(params: {
  ctx: ImportContext;
  parentHcpId: string;
  parentLocalId: string;
  parentType: HcpAttachmentParentType;
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
    hcpString(params.attachment.title) ??
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
  const mimeType = attachmentMimeType(params.attachment, contentType);
  const pathname = `${params.blobPrefix}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const blob = await uploadPrivateBlob(pathname, buffer, { contentType: mimeType });

  await params.createRecord({
    blobUrl: blob.url,
    fileName,
    mimeType,
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
  parentType: HcpAttachmentParentType;
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

  let loggedEmptySample = false;

  for (const parent of mappedParents) {
    result.processed++;
    try {
      const attachments = await fetchAttachments(params.ctx, params.parentType, parent.hcpId);
      if (!attachments.length) {
        result.skipped++;
        if (!loggedEmptySample) {
          loggedEmptySample = true;
          result.errors.push(
            `No attachments from HCP for ${params.parentType} ${parent.hcpId} (detail + /attachments endpoints)`
          );
        }
        continue;
      }

      let filesWithoutUrl = 0;
      for (const attachment of attachments) {
        try {
          const beforeSkipped = result.skipped;
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
          if (result.skipped > beforeSkipped) filesWithoutUrl++;
        } catch (err) {
          result.failed++;
          result.errors.push(err instanceof Error ? err.message : "Attachment file failed");
        }
      }

      if (filesWithoutUrl > 0 && filesWithoutUrl === attachments.length) {
        result.errors.push(
          `${filesWithoutUrl} attachment(s) on ${params.parentType} ${parent.hcpId} had no downloadable URL`
        );
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
