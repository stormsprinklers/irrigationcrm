import { HcpEntityType, PriceBookItemType } from "@prisma/client";
import type { BatchResult, ImportContext } from "@/lib/housecall-pro/types";
import { upsertMapping } from "@/lib/housecall-pro/mapping";
import { resolveMaterialCategoryId } from "@/lib/housecall-pro/importers/material-categories";
import {
  discoverAllMaterialCategoryUuids,
  fetchMaterialsPage,
  parseMaterialsCursor,
  serializeMaterialsCursor,
} from "@/lib/housecall-pro/material-categories";
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

  let categoryIds: string[];
  try {
    categoryIds = await discoverAllMaterialCategoryUuids(ctx.client, ctx.batchSize);
  } catch (err) {
    categoryIds = (
      await prisma.hcpEntityMapping.findMany({
        where: { companyId: ctx.companyId, entityType: HcpEntityType.MATERIAL_CATEGORY },
        orderBy: { hcpId: "asc" },
        select: { hcpId: true },
      })
    ).map((m) => m.hcpId);
    if (!categoryIds.length) {
      result.errors.push(
        err instanceof Error ? err.message : "Failed to list material categories from HCP"
      );
    }
  }

  if (!categoryIds.length) {
    result.done = true;
    result.cursor = null;
    result.errors.push("No material categories found. Run Material categories first.");
    return result;
  }

  if (!ctx.cursor) {
    await prisma.housecallProMigrationStep.updateMany({
      where: { migrationId: ctx.migrationId, step: ctx.step },
      data: { totalEstimate: categoryIds.length },
    });
  }

  let { categoryIndex, page } = parseMaterialsCursor(ctx.cursor);

  if (categoryIndex >= categoryIds.length) {
    result.done = true;
    result.cursor = null;
    return result;
  }

  let pageResult;
  while (categoryIndex < categoryIds.length) {
    const categoryUuid = categoryIds[categoryIndex];
    try {
      pageResult = await fetchMaterialsPage(ctx.client, categoryUuid, page, ctx.batchSize);
      break;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`Category ${categoryUuid}: ${message.slice(0, 180)}`);
      categoryIndex++;
      page = 1;
      pageResult = undefined;
    }
  }

  if (!pageResult) {
    result.done = categoryIndex >= categoryIds.length;
    result.cursor = result.done
      ? null
      : serializeMaterialsCursor({ categoryIndex, page: 1 });
    return result;
  }

  const activeCategoryUuid = categoryIds[categoryIndex];

  for (const record of pageResult.items) {
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
        hcpString(record.material_category_uuid) ??
          hcpString(record.material_category_id) ??
          hcpString(record.category_id) ??
          activeCategoryUuid,
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
        active: record.is_active !== false && record.active !== false,
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

  if (pageResult.nextCursor) {
    result.cursor = serializeMaterialsCursor({
      categoryIndex,
      page: Number(pageResult.nextCursor) || page + 1,
    });
    result.done = false;
    return result;
  }

  if (categoryIndex + 1 < categoryIds.length) {
    result.cursor = serializeMaterialsCursor({ categoryIndex: categoryIndex + 1, page: 1 });
    result.done = false;
    return result;
  }

  result.cursor = null;
  result.done = true;
  return result;
}
