import { HcpEntityType, PriceBookItemType } from "@prisma/client";
import { HCP_PATHS } from "@/lib/housecall-pro/constants";
import type { BatchResult, ImportContext } from "@/lib/housecall-pro/types";
import { upsertMapping } from "@/lib/housecall-pro/mapping";
import { hcpId, hcpMoney, hcpQuantity, hcpString } from "@/lib/housecall-pro/utils";
import { ensureCategoryPath } from "@/lib/price-book/queries";
import { prisma } from "@/lib/prisma";

function serviceCategoryPath(record: Record<string, unknown>): string[] {
  const industry = hcpString(record.industry);
  const category = hcpString(record.category) ?? hcpString(record.category_name);
  const subcategories = Object.keys(record)
    .filter((k) => /^subcategory/.test(k))
    .sort()
    .map((k) => hcpString(record[k]))
    .filter(Boolean) as string[];
  const path = [industry, category, ...subcategories].filter(Boolean) as string[];
  return path.length ? path : ["Imported Services"];
}

export async function importServicesBatch(ctx: ImportContext): Promise<BatchResult> {
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

  const page = await ctx.client.getPaginatedFirst(HCP_PATHS.services, {
    cursor: ctx.cursor,
    pageSize: ctx.batchSize,
    arrayKeys: ["services", "price_book_services"],
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
      const categoryId = await ensureCategoryPath(
        ctx.companyId,
        PriceBookItemType.SERVICE,
        serviceCategoryPath(record)
      );

      const unitPrice = hcpMoney(record.price ?? record.unit_price ?? record.amount);
      const laborRate = hcpMoney(record.labor_rate);
      const laborHours = hcpQuantity(record.labor_hours);

      const itemData = {
        categoryId,
        type: PriceBookItemType.SERVICE,
        name,
        description: hcpString(record.description),
        unitPrice,
        laborRate: laborRate || null,
        laborHours: laborHours || null,
        unit: hcpString(record.unit) ?? "each",
        active: record.enabled !== false && record.active !== false,
      };

      const mapping = await prisma.hcpEntityMapping.findUnique({
        where: {
          companyId_entityType_hcpId: {
            companyId: ctx.companyId,
            entityType: HcpEntityType.SERVICE,
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
          entityType: HcpEntityType.SERVICE,
          hcpId: id,
          localId: item.id,
        });
        result.created++;
      }
    } catch (err) {
      result.failed++;
      result.errors.push(err instanceof Error ? err.message : "Service import failed");
    }
  }

  result.cursor = page.nextCursor;
  result.done = !page.nextCursor;
  return result;
}

export async function resolvePriceBookItemId(
  companyId: string,
  hcpServiceId: string | null,
  hcpMaterialId: string | null,
  name: string
) {
  if (hcpServiceId) {
    const mapped = await prisma.hcpEntityMapping.findUnique({
      where: {
        companyId_entityType_hcpId: {
          companyId,
          entityType: HcpEntityType.SERVICE,
          hcpId: hcpServiceId,
        },
      },
    });
    if (mapped) return mapped.localId;
  }
  if (hcpMaterialId) {
    const mapped = await prisma.hcpEntityMapping.findUnique({
      where: {
        companyId_entityType_hcpId: {
          companyId,
          entityType: HcpEntityType.MATERIAL,
          hcpId: hcpMaterialId,
        },
      },
    });
    if (mapped) return mapped.localId;
  }

  const byName = await prisma.priceBookItem.findFirst({
    where: {
      category: { companyId },
      name: { equals: name, mode: "insensitive" },
    },
    select: { id: true },
  });
  return byName?.id ?? null;
}
