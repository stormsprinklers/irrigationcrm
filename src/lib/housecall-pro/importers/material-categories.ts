import { HcpEntityType, PriceBookItemType } from "@prisma/client";
import type { BatchResult, ImportContext, HcpRecord } from "@/lib/housecall-pro/types";
import { upsertMapping } from "@/lib/housecall-pro/mapping";
import {
  fetchMaterialCategoriesPage,
  parseMaterialCategoryCursor,
  serializeMaterialCategoryCursor,
} from "@/lib/housecall-pro/material-categories";
import { hcpId, hcpString, uniqueSlug } from "@/lib/housecall-pro/utils";
import { ensureCategoryPath, slugify } from "@/lib/price-book/queries";
import { prisma } from "@/lib/prisma";

function materialCategorySlug(
  name: string,
  parentSlug: string | null,
  existingSlugs: Set<string>
): string {
  const segment = slugify(name) || "category";
  const base = parentSlug ? `${parentSlug}-${segment}` : `material-${segment}`;
  return uniqueSlug(base, existingSlugs);
}

async function importCategoryRecord(
  ctx: ImportContext,
  record: HcpRecord,
  existingSlugs: Set<string>,
  result: BatchResult,
  newChildParents: string[]
) {
  const id = hcpId(record);
  const name = hcpString(record.name);
  if (!id || !name) {
    result.skipped++;
    return;
  }

  newChildParents.push(id);

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
  let parentSlug: string | null = null;
  const parentHcpId =
    hcpString(record.parent_id) ??
    hcpString(record.parent_category_id) ??
    hcpString(record.parent_uuid);
  if (parentHcpId) {
    const parentMapping = await prisma.hcpEntityMapping.findUnique({
      where: {
        companyId_entityType_hcpId: {
          companyId: ctx.companyId,
          entityType: HcpEntityType.MATERIAL_CATEGORY,
          hcpId: parentHcpId,
        },
      },
    });
    if (parentMapping) {
      parentLocalId = parentMapping.localId;
      const parentCategory = await prisma.priceBookCategory.findUnique({
        where: { id: parentMapping.localId },
        select: { slug: true },
      });
      parentSlug = parentCategory?.slug ?? null;
    }
  }

  if (mapping) {
    await prisma.priceBookCategory.update({
      where: { id: mapping.localId },
      data: { name, parentId: parentLocalId },
    });
    result.updated++;
  } else {
    const slug = materialCategorySlug(name, parentSlug, existingSlugs);
    try {
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
    } catch (err) {
      const isSlugConflict =
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code?: string }).code === "P2002";
      if (isSlugConflict) {
        const fallbackSlug = materialCategorySlug(`${name}-${id.slice(0, 8)}`, parentSlug, existingSlugs);
        const category = await prisma.priceBookCategory.create({
          data: {
            companyId: ctx.companyId,
            type: PriceBookItemType.MATERIAL,
            name,
            slug: fallbackSlug,
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
      } else {
        throw err;
      }
    }
  }
}

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

  let state = parseMaterialCategoryCursor(ctx.cursor);
  const newChildParents: string[] = [];

  const existingSlugs = new Set(
    (
      await prisma.priceBookCategory.findMany({
        where: { companyId: ctx.companyId },
        select: { slug: true },
      })
    ).map((c) => c.slug)
  );

  let pageResult;
  if (state.phase === "roots") {
    pageResult = await fetchMaterialCategoriesPage(ctx.client, {
      parentUuid: null,
      page: state.page,
      pageSize: ctx.batchSize,
    });
  } else {
    const parentUuid = state.childParentQueue[state.childParentIndex];
    if (!parentUuid) {
      result.done = true;
      result.cursor = null;
      return result;
    }
    pageResult = await fetchMaterialCategoriesPage(ctx.client, {
      parentUuid,
      page: state.page,
      pageSize: ctx.batchSize,
    });
  }

  if (pageResult.totalEstimate != null && !ctx.cursor) {
    await prisma.housecallProMigrationStep.updateMany({
      where: { migrationId: ctx.migrationId, step: ctx.step },
      data: { totalEstimate: pageResult.totalEstimate },
    });
  }

  for (const record of pageResult.items) {
    result.processed++;
    try {
      await importCategoryRecord(ctx, record, existingSlugs, result, newChildParents);
    } catch (err) {
      result.failed++;
      result.errors.push(err instanceof Error ? err.message : "Material category import failed");
    }
  }

  if (!pageResult.nextCursor) {
    if (state.phase === "children" && newChildParents.length) {
      const existing = new Set(state.childParentQueue);
      for (const id of newChildParents) {
        if (!existing.has(id)) {
          state.childParentQueue.push(id);
          existing.add(id);
        }
      }
    }
  }

  if (pageResult.nextCursor) {
    state.page = Number(pageResult.nextCursor) || state.page + 1;
    if (state.phase === "roots") {
      state.rootsImportedIds = [...new Set([...state.rootsImportedIds, ...newChildParents])];
    }
    result.cursor = serializeMaterialCategoryCursor(state);
    result.done = false;
    return result;
  }

  if (state.phase === "roots") {
    const queue = [...new Set([...state.rootsImportedIds, ...newChildParents])];
    if (queue.length) {
      result.cursor = serializeMaterialCategoryCursor({
        phase: "children",
        page: 1,
        childParentQueue: queue,
        childParentIndex: 0,
        rootsImportedIds: [],
      });
      result.done = false;
      return result;
    }
    result.done = true;
    result.cursor = null;
    return result;
  }

  const nextParentIndex = state.childParentIndex + 1;
  if (nextParentIndex < state.childParentQueue.length) {
    result.cursor = serializeMaterialCategoryCursor({
      ...state,
      childParentIndex: nextParentIndex,
      page: 1,
      rootsImportedIds: [],
    });
    result.done = false;
    return result;
  }

  result.done = true;
  result.cursor = null;
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
