import { createHash } from "crypto";
import { HcpEntityType } from "@prisma/client";
import {
  HCP_ATTACHMENT_PATHS,
  HCP_PARENT_DETAIL_PATHS,
} from "@/lib/housecall-pro/constants";
import {
  emptyBatchResult,
  debugLabelForRecord,
  pushDebug,
  summarizeHcpRecord,
} from "@/lib/housecall-pro/debug";
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

type AttachmentPathCache = {
  detailPathIndex: number | null;
  attachmentsPathIndex: number | null;
  /** After expand returns 200 with 0 files, skip /attachments on later parents. */
  expandEmptyIsAuthoritative: boolean;
};

const attachmentPathCache = new Map<HcpAttachmentParentType, AttachmentPathCache>();

function getAttachmentPathCache(parentType: HcpAttachmentParentType): AttachmentPathCache {
  const existing = attachmentPathCache.get(parentType);
  if (existing) return existing;
  const created: AttachmentPathCache = {
    detailPathIndex: null,
    attachmentsPathIndex: null,
    expandEmptyIsAuthoritative: false,
  };
  attachmentPathCache.set(parentType, created);
  return created;
}

function orderedIndexes(length: number, preferred: number | null): number[] {
  const indexes = Array.from({ length }, (_, i) => i);
  if (preferred == null || preferred < 0 || preferred >= length) return indexes;
  return [preferred, ...indexes.filter((i) => i !== preferred)];
}

async function fetchAttachments(
  ctx: ImportContext,
  parentType: HcpAttachmentParentType,
  parentHcpId: string,
  debug?: { result: BatchResult; enabled: boolean }
): Promise<HcpRecord[]> {
  const cache = getAttachmentPathCache(parentType);
  const attempts: string[] = [];
  const detailPaths = HCP_PARENT_DETAIL_PATHS[parentType](parentHcpId);
  const attachmentPaths = HCP_ATTACHMENT_PATHS[parentType](parentHcpId);

  let expandSucceeded = false;

  for (const index of orderedIndexes(detailPaths.length, cache.detailPathIndex)) {
    const path = detailPaths[index];
    try {
      const data = await ctx.client.get<HcpRecord>(path, { params: { ...HCP_EXPAND_ATTACHMENTS } });
      const found = collectAttachmentsFromResponse(data, parentType);
      attempts.push(`${path}?expand=attachments → ${found.length} attachment(s)`);
      cache.detailPathIndex = index;
      expandSucceeded = true;
      if (found.length) {
        if (debug?.enabled) {
          pushDebug(debug.result, {
            action: "info",
            label: `Fetched attachments via detail ${path}`,
            hcpId: parentHcpId,
            detail: { attempts, count: found.length, cachedPath: path },
          });
        }
        return dedupeAttachments(found);
      }
      break;
    } catch (err) {
      attempts.push(`${path} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (expandSucceeded && cache.expandEmptyIsAuthoritative) {
    if (debug?.enabled) {
      pushDebug(debug.result, {
        action: "info",
        label: `No attachments for ${parentType} ${parentHcpId} (cached empty expand)`,
        hcpId: parentHcpId,
        detail: { attempts },
      });
    }
    return [];
  }

  const items: HcpRecord[] = [];
  if (!cache.expandEmptyIsAuthoritative) {
    for (const index of orderedIndexes(attachmentPaths.length, cache.attachmentsPathIndex)) {
      const path = attachmentPaths[index];
      try {
        const data = await ctx.client.get<HcpRecord>(path);
        const found = collectAttachmentsFromResponse(data, parentType);
        attempts.push(`${path} → ${found.length} attachment(s)`);
        cache.attachmentsPathIndex = index;
        items.push(...found);
        if (found.length) break;
        if (expandSucceeded) {
          cache.expandEmptyIsAuthoritative = true;
          break;
        }
      } catch (err) {
        attempts.push(`${path} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  if (debug?.enabled) {
    pushDebug(debug.result, {
      action: items.length ? "pulled" : "info",
      label: items.length
        ? `Pulled ${items.length} attachment(s) for ${parentType} ${parentHcpId}`
        : `No attachments found for ${parentType} ${parentHcpId}`,
      hcpId: parentHcpId,
      detail: {
        attempts,
        sample: items.slice(0, 3).map((a) => ({
          ...summarizeHcpRecord(a),
          previewUrl: attachmentFileUrl(a),
          previewMimeType: attachmentMimeType(a, "application/octet-stream"),
        })),
      },
      previewUrl: items[0] ? attachmentFileUrl(items[0]) : null,
      previewMimeType: items[0] ? attachmentMimeType(items[0], "application/octet-stream") : null,
    });
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
  debugEnabled: boolean;
}) {
  const fileUrl = attachmentFileUrl(params.attachment);
  const label = debugLabelForRecord(params.attachment, "Attachment");
  if (!fileUrl) {
    params.result.skipped++;
    pushDebug(
      params.result,
      {
        action: "skipped",
        label,
        hcpId: hcpId(params.attachment),
        detail: summarizeHcpRecord(params.attachment),
        error: "No downloadable URL on attachment payload",
      },
      { enabled: params.debugEnabled }
    );
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
    pushDebug(
      params.result,
      {
        action: "updated",
        label: `${fileName} (already imported)`,
        hcpId: attachmentId,
        detail: { fileUrl, mappingKey },
        previewUrl: fileUrl,
        previewMimeType: attachmentMimeType(params.attachment, "application/octet-stream"),
      },
      { enabled: params.debugEnabled }
    );
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
  pushDebug(
    params.result,
    {
      action: "created",
      label: fileName,
      hcpId: attachmentId,
      detail: {
        fileUrl,
        mimeType,
        bytes: buffer.byteLength,
        blobUrl: blob.url,
        parentHcpId: params.parentHcpId,
      },
      previewUrl: fileUrl,
      previewMimeType: mimeType,
    },
    { enabled: params.debugEnabled }
  );
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
  const debugEnabled = Boolean(params.ctx.options.debugMode);
  const result = emptyBatchResult(params.ctx.cursor);

  const offset = parseAttachmentCursor(params.ctx.cursor);
  const mappedParents = await listMappedParents(
    params.ctx.companyId,
    params.parentEntityType,
    offset,
    params.ctx.batchSize
  );

  if (!params.ctx.cursor) {
    const total = await countMappedParents(params.ctx.companyId, params.parentEntityType);
    await prisma.housecallProMigrationStep.updateMany({
      where: { migrationId: params.ctx.migrationId, step: params.ctx.step },
      data: { totalEstimate: total },
    });
  }

  pushDebug(
    result,
    {
      action: "info",
      label: `Scanning ${mappedParents.length} mapped ${params.parentType} (offset ${offset})`,
      detail: {
        parentIds: mappedParents.map((p) => p.hcpId),
        batchSize: params.ctx.batchSize,
      },
    },
    { enabled: debugEnabled }
  );

  for (const parent of mappedParents) {
    result.processed++;
    try {
      const attachments = await fetchAttachments(params.ctx, params.parentType, parent.hcpId, {
        result,
        enabled: debugEnabled,
      });
      if (!attachments.length) {
        result.skipped++;
        pushDebug(
          result,
          {
            action: "skipped",
            label: `Parent ${parent.hcpId}`,
            hcpId: parent.hcpId,
            error: `No attachments from HCP for ${params.parentType} ${parent.hcpId}`,
          },
          { enabled: debugEnabled }
        );
        continue;
      }

      pushDebug(
        result,
        {
          action: "pulled",
          label: `${attachments.length} attachment(s) on ${params.parentType} ${parent.hcpId}`,
          hcpId: parent.hcpId,
          detail: {
            files: attachments.map((a) => ({
              label: debugLabelForRecord(a, "Attachment"),
              ...summarizeHcpRecord(a),
              hasUrl: Boolean(attachmentFileUrl(a)),
              previewUrl: attachmentFileUrl(a),
              previewMimeType: attachmentMimeType(a, "application/octet-stream"),
            })),
          },
          previewUrl: attachments[0] ? attachmentFileUrl(attachments[0]) : null,
          previewMimeType: attachments[0]
            ? attachmentMimeType(attachments[0], "application/octet-stream")
            : null,
        },
        { enabled: debugEnabled }
      );

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
            debugEnabled,
          });
          if (result.skipped > beforeSkipped) filesWithoutUrl++;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Attachment file failed";
          result.failed++;
          result.errors.push(message);
          pushDebug(
            result,
            {
              action: "failed",
              label: debugLabelForRecord(attachment, "Attachment"),
              hcpId: hcpId(attachment),
              detail: summarizeHcpRecord(attachment),
              error: message,
            },
            { enabled: debugEnabled }
          );
        }
      }

      if (filesWithoutUrl > 0 && filesWithoutUrl === attachments.length) {
        result.errors.push(
          `${filesWithoutUrl} attachment(s) on ${params.parentType} ${parent.hcpId} had no downloadable URL`
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Attachment batch failed";
      result.failed++;
      result.errors.push(message);
      pushDebug(
        result,
        {
          action: "failed",
          label: `Parent ${parent.hcpId}`,
          hcpId: parent.hcpId,
          error: message,
        },
        { enabled: debugEnabled }
      );
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
