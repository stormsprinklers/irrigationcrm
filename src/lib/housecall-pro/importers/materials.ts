import { HcpEntityType, PriceBookItemType } from "@prisma/client";
import { HCP_PATHS } from "@/lib/housecall-pro/constants";
import type { BatchResult, ImportContext } from "@/lib/housecall-pro/types";
import { upsertMapping } from "@/lib/housecall-pro/mapping";
import { resolveMaterialCategoryId } from "@/lib/housecall-pro/importers/material-categories";
import { hcpId, hcpMoney, hcpString } from "@/lib/housecall-pro/utils";
import { prisma } from "@/lib/prisma";

const MATERIALS_PATH = HCP_PATHS.materials[0];
const MATERIAL_ARRAY_KEYS = ["materials", "data"];

type MaterialsCursor = {
  categoryIndex: number;
  page: number;
};

function parseMaterialsCursor(cursor: string | null, categoryIds: string[]): MaterialsCursor {
  if (!categoryIds.length) {
    return { categoryIndex: 0, page: 1 };
  }
  if (!cursor) {
    return { categoryIndex: 0, page: 1 };
  }

  const separator = cursor.indexOf(":");
  if (separator <= 0) {
    return { categoryIndex: 0, page: 1 };
  }

  const categoryId = cursor.slice(0, separator);
  const page = Number(cursor.slice(separator + 1)) || 1;
  const categoryIndex = categoryIds.indexOf(categoryId);
  if (categoryIndex < 0) {
    return { categoryIndex: 0, page: 1 };
  }

  return { categoryIndex, page };
}

function formatMaterialsCursor(categoryId: string, page: number) {
  return `${categoryId}:${page}`;
}

async function listImportedMaterialCategoryIds(companyId: string) {
  const mappings = await prisma.hcpEntityMapping.findMany({
    where: {
      companyId,
      entityType: HcpEntityType.MATERIAL_CATEGORY,
    },
    orderBy: { hcpId: "asc" },
    select: { hcpId: true },
  });
  return mappings.map((mapping) => mapping.hcpId);
}

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

  const categoryIds = await listImportedMaterialCategoryIds(ctx.companyId);
  if (!categoryIds.length) {
    result.done = true;
    result.cursor = null;
    result.errors.push("No imported material categories found. Run Material categories first.");
    return result;
  }

  let { categoryIndex, page } = parseMaterialsCursor(ctx.cursor, categoryIds);

  let pageResult;
  while (categoryIndex < categoryIds.length) {
    const categoryUuid = categoryIds[categoryIndex];
    try {
      pageResult = await ctx.client.getPaginated(MATERIALS_PATH, {
        cursor: page === 1 ? null : String(page),
        pageSize: ctx.batchSize,
        arrayKeys: MATERIAL_ARRAY_KEYS,
        params: { material_category_uuid: categoryUuid },
      });
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
    result.done = true;
    result.cursor = null;
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
    result.cursor = formatMaterialsCursor(activeCategoryUuid, Number(pageResult.nextCursor) || page + 1);
    result.done = false;
    return result;
  }

  if (categoryIndex + 1 < categoryIds.length) {
    result.cursor = formatMaterialsCursor(categoryIds[categoryIndex + 1], 1);
    result.done = false;
    return result;
  }

  result.cursor = null;
  result.done = true;
  return result;
}
