import { prisma } from "@/lib/prisma";
import { ensureCategoryPath } from "@/lib/price-book/queries";
import { holidayCatalogSkus, type HolidayLightingCatalog, type HolidayPriceBookRow } from "./types";

export async function ensureHolidayPriceBookItems(
  companyId: string,
  catalog: HolidayLightingCatalog
): Promise<HolidayPriceBookRow[]> {
  const skus = holidayCatalogSkus(catalog);
  const categoryId = await ensureCategoryPath(companyId, "SERVICE", ["Holiday lighting"]);

  const existing = await prisma.priceBookItem.findMany({
    where: {
      sku: { in: skus.map((row) => row.sku) },
      category: { companyId },
    },
    select: {
      id: true,
      sku: true,
      name: true,
      unit: true,
      unitPrice: true,
      unitCost: true,
    },
  });
  const bySku = new Map(existing.filter((row) => row.sku).map((row) => [row.sku!, row]));

  for (const row of skus) {
    const found = bySku.get(row.sku);
    if (found) {
      if (found.name !== row.name || found.unit !== row.unit) {
        const updated = await prisma.priceBookItem.update({
          where: { id: found.id },
          data: { name: row.name, unit: row.unit, active: true },
          select: {
            id: true,
            sku: true,
            name: true,
            unit: true,
            unitPrice: true,
            unitCost: true,
          },
        });
        bySku.set(row.sku, updated);
      }
      continue;
    }
    const created = await prisma.priceBookItem.create({
      data: {
        categoryId,
        type: "SERVICE",
        name: row.name,
        sku: row.sku,
        unit: row.unit,
        unitPrice: 0,
        unitCost: 0,
        pricingMode: "MANUAL",
        active: true,
        sortOrder: skus.indexOf(row),
      },
      select: {
        id: true,
        sku: true,
        name: true,
        unit: true,
        unitPrice: true,
        unitCost: true,
      },
    });
    bySku.set(row.sku, created);
  }

  return skus.map((row) => {
    const item = bySku.get(row.sku);
    return {
      sku: row.sku,
      name: row.name,
      unit: row.unit,
      unitPrice: item ? Number(item.unitPrice) : 0,
      unitCost: item?.unitCost != null ? Number(item.unitCost) : null,
      priceBookItemId: item?.id ?? null,
    };
  });
}

export async function updateHolidayPriceBookPrices(
  companyId: string,
  prices: Array<{ sku: string; unitPrice?: number; unitCost?: number | null }>
) {
  for (const row of prices) {
    const sku = row.sku?.trim();
    if (!sku) continue;
    const item = await prisma.priceBookItem.findFirst({
      where: { sku, category: { companyId } },
      select: { id: true },
    });
    if (!item) continue;
    await prisma.priceBookItem.update({
      where: { id: item.id },
      data: {
        ...(row.unitPrice != null && Number.isFinite(row.unitPrice)
          ? { unitPrice: Math.max(0, row.unitPrice) }
          : {}),
        ...(row.unitCost === null
          ? { unitCost: null }
          : row.unitCost != null && Number.isFinite(row.unitCost)
            ? { unitCost: Math.max(0, row.unitCost) }
            : {}),
      },
    });
  }
}
