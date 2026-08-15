import type { BatchResult, ImportContext, HcpRecord } from "@/lib/housecall-pro/types";
import {
  emptyBatchResult,
  pushDebug,
  pushEntityDebug,
} from "@/lib/housecall-pro/debug";
import { prisma } from "@/lib/prisma";
import { hcpId, hcpString, hcpTags } from "@/lib/housecall-pro/utils";

export async function importTagsBatch(ctx: ImportContext): Promise<BatchResult> {
  const debugEnabled = Boolean(ctx.options.debugMode);
  const result = emptyBatchResult(ctx.cursor);

  const page = await ctx.client.getPaginated("/tags", {
    cursor: ctx.cursor,
    pageSize: ctx.batchSize,
    arrayKeys: ["tags"],
  });

  pushDebug(
    result,
    {
      action: "pulled",
      label: `HCP returned ${page.items.length} tag(s)`,
      detail: {
        nextCursor: page.nextCursor,
        names: page.items
          .map((r) => hcpString((r as HcpRecord).name) ?? hcpString((r as HcpRecord).label))
          .filter(Boolean),
      },
    },
    { enabled: debugEnabled }
  );

  if (page.totalEstimate != null && !ctx.cursor) {
    await prisma.housecallProMigrationStep.updateMany({
      where: { migrationId: ctx.migrationId, step: ctx.step },
      data: { totalEstimate: page.totalEstimate },
    });
  }

  const tagNames = new Set<string>();
  for (const record of page.items) {
    result.processed++;
    const id = hcpId(record);
    const name = hcpString(record.name) ?? hcpString(record.label);
    if (!id || !name) {
      result.skipped++;
      pushEntityDebug(result, {
        enabled: debugEnabled,
        action: "skipped",
        kind: "Tag",
        record,
        fields: { reason: "Missing id or name" },
      });
      continue;
    }
    tagNames.add(name);
    try {
      const existing = await prisma.hcpEntityMapping.findUnique({
        where: {
          companyId_entityType_hcpId: {
            companyId: ctx.companyId,
            entityType: "TAG",
            hcpId: id,
          },
        },
      });
      if (existing) {
        result.updated++;
        pushEntityDebug(result, {
          enabled: debugEnabled,
          action: "updated",
          kind: "Tag",
          record,
          fields: { name, color: hcpString(record.color) ?? hcpString(record.color_hex) },
        });
      } else {
        await prisma.hcpEntityMapping.create({
          data: {
            companyId: ctx.companyId,
            migrationId: ctx.migrationId,
            entityType: "TAG",
            hcpId: id,
            localId: name,
            metadataJson: { name },
          },
        });
        result.created++;
        pushEntityDebug(result, {
          enabled: debugEnabled,
          action: "created",
          kind: "Tag",
          record,
          fields: { name, color: hcpString(record.color) ?? hcpString(record.color_hex) },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Tag import failed";
      result.failed++;
      result.errors.push(message);
      pushEntityDebug(result, {
        enabled: debugEnabled,
        action: "failed",
        kind: "Tag",
        record,
        fields: { name },
        error: message,
      });
    }
  }

  const migration = await prisma.housecallProMigration.findUnique({
    where: { id: ctx.migrationId },
    select: { previewJson: true },
  });
  const preview = (migration?.previewJson as Record<string, unknown> | null) ?? {};
  await prisma.housecallProMigration.update({
    where: { id: ctx.migrationId },
    data: {
      previewJson: {
        ...preview,
        tagCatalog: Array.from(tagNames),
      },
    },
  });

  result.cursor = page.nextCursor;
  result.done = !page.nextCursor;
  return result;
}

export function applyEntityTags(record: { tags?: string[] }, hcpRecord: { tags?: unknown }) {
  const tags = hcpTags(hcpRecord as Record<string, unknown>);
  if (tags.length) record.tags = tags;
}
