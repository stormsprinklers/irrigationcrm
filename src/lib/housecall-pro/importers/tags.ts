import type { BatchResult, ImportContext } from "@/lib/housecall-pro/types";
import { prisma } from "@/lib/prisma";
import { hcpId, hcpString, hcpTags } from "@/lib/housecall-pro/utils";

export async function importTagsBatch(ctx: ImportContext): Promise<BatchResult> {
  const result: BatchResult = {
    done: false,
    cursor: ctx.cursor,
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const page = await ctx.client.getPaginated("/tags", {
    cursor: ctx.cursor,
    pageSize: ctx.batchSize,
    arrayKeys: ["tags"],
  });

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
      }
    } catch (err) {
      result.failed++;
      result.errors.push(err instanceof Error ? err.message : "Tag import failed");
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
