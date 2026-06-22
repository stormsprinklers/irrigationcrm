import { HcpEntityType, PriceBookItemType } from "@prisma/client";
import { HCP_PATHS } from "@/lib/housecall-pro/constants";
import type { BatchResult, ImportContext } from "@/lib/housecall-pro/types";
import { upsertMapping } from "@/lib/housecall-pro/mapping";
import { resolveMaterialCategoryId } from "@/lib/housecall-pro/importers/material-categories";
import { hcpId, hcpMoney, hcpString } from "@/lib/housecall-pro/utils";
import { prisma } from "@/lib/prisma";

export async function importMaterialsBatch(ctx: ImportContext): Promise<BatchResult> {
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

  const page = await ctx.client.getPaginatedFirst(HCP_PATHS.materials, {
    cursor: ctx.cursor,
    pageSize: ctx.batchSize,
    arrayKeys: ["materials"],
  });

  if (page.totalEstimate != null && !ctx.cursor) {
    await prisma.housecallProMigrationStep.updateMany({
      where: { migrationId: ctx.migrationId, step: ctx.step },
      data: { totalEstimate: page.totalEstimate },
    });
  }

  for (const record of page.items) {
    result.processed++;
    const id = hcpId(record);
    const name = hcpString(record.name);
    if (!id || !name) {
      result.skipped++;
      continue;
    }

    try {
      const categoryId = await resolveMaterialCategoryId(
        ctx.companyId,
        ctx.migrationId,
        hcpString(record.material_category_id) ?? hcpString(record.category_id),
        hcpString(record.category_name)
      );

      const unitPrice = hcpMoney(record.price ?? record.unit_price ?? record.amount);
      const unitCost = hcpMoney(record.cost ?? record.unit_cost);
      const itemData = {
        categoryId,
        type: PriceBookItemType.MATERIAL,
        name,
        description: hcpString(record.description),
        sku: hcpString(record.sku) ?? hcpString(record.part_number),
        unitPrice,
        unitCost: unitCost || null,
        unit: hcpString(record.unit) ?? "each",
        active: record.active !== false,
      };

      const mapping = await prisma.hcpEntityMapping.findUnique({
        where: {
          companyId_entityType_hcpId: {
            companyId: ctx.companyId,
            entityType: HcpEntityType.MATERIAL,
            hcpId: id,
          },
        },
      });

      if (mapping) {
        await prisma.priceBookItem.update({
          where: { id: mapping.localId },
          data: itemData,
        });
        result.updated++;
      } else {
        const item = await prisma.priceBookItem.create({ data: itemData });
        await upsertMapping({
          companyId: ctx.companyId,
          migrationId: ctx.migrationId,
          entityType: HcpEntityType.MATERIAL,
          hcpId: id,
          localId: item.id,
        });
        result.created++;
      }
    } catch (err) {
      result.failed++;
      result.errors.push(err instanceof Error ? err.message : "Material import failed");
    }
  }

  result.cursor = page.nextCursor;
  result.done = !page.nextCursor;
  return result;
}
