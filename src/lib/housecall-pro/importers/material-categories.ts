import { HcpEntityType, PriceBookItemType } from "@prisma/client";
import { HCP_PATHS } from "@/lib/housecall-pro/constants";
import type { BatchResult, ImportContext } from "@/lib/housecall-pro/types";
import { upsertMapping } from "@/lib/housecall-pro/mapping";
import { hcpId, hcpString, uniqueSlug } from "@/lib/housecall-pro/utils";
import { ensureCategoryPath } from "@/lib/price-book/queries";
import { prisma } from "@/lib/prisma";

export async function importMaterialCategoriesBatch(ctx: ImportContext): Promise<BatchResult> {
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

  const page = await ctx.client.getPaginated(HCP_PATHS.materialCategories, {
    cursor: ctx.cursor,
    pageSize: 100,
    arrayKeys: ["categories", "material_categories"],
  });

  if (page.totalEstimate != null && !ctx.cursor) {
    await prisma.housecallProMigrationStep.updateMany({
      where: { migrationId: ctx.migrationId, step: ctx.step },
      data: { totalEstimate: page.totalEstimate },
    });
  }

  const existingSlugs = new Set(
    (
      await prisma.priceBookCategory.findMany({
        where: { companyId: ctx.companyId, type: PriceBookItemType.MATERIAL },
        select: { slug: true },
      })
    ).map((c) => c.slug)
  );

  for (const record of page.items) {
    result.processed++;
    const id = hcpId(record);
    const name = hcpString(record.name);
    if (!id || !name) {
      result.skipped++;
      continue;
    }

    try {
      const mapping = await prisma.hcpEntityMapping.findUnique({
        where: {
          companyId_entityType_hcpId: {
            companyId: ctx.companyId,
            entityType: HcpEntityType.MATERIAL_CATEGORY,
            hcpId: id,
          },
        },
      });

      let parentLocalId: string | null = null;
      const parentHcpId = hcpString(record.parent_id) ?? hcpString(record.parent_category_id);
      if (parentHcpId) {
        parentLocalId = await prisma.hcpEntityMapping
          .findUnique({
            where: {
              companyId_entityType_hcpId: {
                companyId: ctx.companyId,
                entityType: HcpEntityType.MATERIAL_CATEGORY,
                hcpId: parentHcpId,
              },
            },
          })
          .then((m) => m?.localId ?? null);
      }

      if (mapping) {
        await prisma.priceBookCategory.update({
          where: { id: mapping.localId },
          data: { name, parentId: parentLocalId },
        });
        result.updated++;
      } else {
        const slug = uniqueSlug(name, existingSlugs);
        const category = await prisma.priceBookCategory.create({
          data: {
            companyId: ctx.companyId,
            type: PriceBookItemType.MATERIAL,
            name,
            slug,
            parentId: parentLocalId,
          },
        });
        await upsertMapping({
          companyId: ctx.companyId,
          migrationId: ctx.migrationId,
          entityType: HcpEntityType.MATERIAL_CATEGORY,
          hcpId: id,
          localId: category.id,
        });
        result.created++;
      }
    } catch (err) {
      result.failed++;
      result.errors.push(err instanceof Error ? err.message : "Material category import failed");
    }
  }

  result.cursor = page.nextCursor;
  result.done = !page.nextCursor;
  return result;
}

export async function resolveMaterialCategoryId(
  companyId: string,
  migrationId: string,
  hcpCategoryId: string | null,
  categoryName: string | null
) {
  if (hcpCategoryId) {
    const mapped = await prisma.hcpEntityMapping.findUnique({
      where: {
        companyId_entityType_hcpId: {
          companyId,
          entityType: HcpEntityType.MATERIAL_CATEGORY,
          hcpId: hcpCategoryId,
        },
      },
    });
    if (mapped) return mapped.localId;
  }
  if (categoryName) {
    return ensureCategoryPath(companyId, PriceBookItemType.MATERIAL, [categoryName]);
  }
  return ensureCategoryPath(companyId, PriceBookItemType.MATERIAL, ["Imported"]);
}
