import { prisma } from "@/lib/prisma";
import { ensureCategoryPath } from "@/lib/price-book/queries";
import { holidayCatalogSkus, type HolidayLightingCatalog, type HolidayPriceBookRow } from "./types";

export async function ensureHolidayPriceBookItems(
  companyId: string,
  catalog: HolidayLightingCatalog
): Promise<HolidayPriceBookRow[]> {
  const skus = holidayCatalogSkus(catalog);
  const categoryId = await ensureCategoryPath(companyId, "SERVICE", ["Holiday lighting"]);

  // The holiday catalog used to create separate purchase, lease, parts, labor,
  // and difficulty rows. Keep their history intact, but remove them from the
  // active price book now that every quote uses one service price.
  await prisma.priceBookItem.updateMany({
    where: {
      categoryId,
      sku: { notIn: skus.map((row) => row.sku) },
      active: true,
    },
    data: { active: false },
  });

  const legacyItems = await prisma.priceBookItem.findMany({
    where: { categoryId },
    select: { sku: true, unitPrice: true, unitCost: true },
  });
  const legacyBySku = new Map(
    legacyItems.filter((item) => item.sku).map((item) => [item.sku!, item])
  );
  function legacySeed(sku: string) {
    const prefix = sku.includes("C9") ? "C9" : sku.includes("C7") ? "C7" : null;
    if (prefix) {
      const lease = legacyBySku.get(`HL-${prefix}-LEASE-FT`);
      const parts = legacyBySku.get(`HL-${prefix}-PARTS-FT`);
      const labor = legacyBySku.get("HL-TEMP-INSTALL-FT");
      return {
        unitPrice: lease && Number(lease.unitPrice) > 0
          ? Number(lease.unitPrice)
          : Number(parts?.unitPrice ?? 0) + Number(labor?.unitPrice ?? 0),
        unitCost: parts?.unitCost == null ? 0 : Number(parts.unitCost),
      };
    }
    if (sku === "HL-PERM-SERVICE-FT") {
      const permanent = legacyBySku.get("HL-PERM-FT");
      return {
        unitPrice: Number(permanent?.unitPrice ?? 0),
        unitCost: permanent?.unitCost == null ? 0 : Number(permanent.unitCost),
      };
    }
    const placement = sku.includes("TREE") ? "TREE" : sku.includes("BUSH") ? "BUSH" : null;
    if (placement) {
      const parts = legacyBySku.get(`HL-${placement}-S`);
      const labor = legacyBySku.get(`HL-${placement}-S-D1-LABOR`);
      const lease = legacyBySku.get(`HL-${placement}-S-D1-LEASE`);
      return {
        unitPrice: lease && Number(lease.unitPrice) > 0
          ? Number(lease.unitPrice)
          : Number(parts?.unitPrice ?? 0) + Number(labor?.unitPrice ?? 0),
        unitCost: parts?.unitCost == null ? 0 : Number(parts.unitCost),
      };
    }
    return { unitPrice: 0, unitCost: 0 };
  }

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
      active: true,
    },
  });
  const bySku = new Map(existing.filter((row) => row.sku).map((row) => [row.sku!, row]));

  for (const row of skus) {
    const found = bySku.get(row.sku);
    if (found) {
      const migrated = legacySeed(row.sku);
      const shouldApplyDefaultPrice =
        (row.defaultUnitPrice ?? 0) > 0 && Number(found.unitPrice) === 0;
      const shouldApplyMigratedCost = Number(found.unitCost ?? 0) === 0 && migrated.unitCost > 0;
      if (!found.active || found.name !== row.name || found.unit !== row.unit || shouldApplyDefaultPrice || shouldApplyMigratedCost) {
        const updated = await prisma.priceBookItem.update({
          where: { id: found.id },
          data: {
            name: row.name,
            unit: row.unit,
            active: true,
            ...(shouldApplyDefaultPrice
              ? { unitPrice: migrated.unitPrice > 0 ? migrated.unitPrice : row.defaultUnitPrice }
              : {}),
            ...(shouldApplyMigratedCost ? { unitCost: migrated.unitCost } : {}),
          },
          select: {
            id: true,
            sku: true,
            name: true,
            unit: true,
            unitPrice: true,
            unitCost: true,
            active: true,
          },
        });
        bySku.set(row.sku, updated);
      }
      continue;
    }
    const migrated = legacySeed(row.sku);
    const created = await prisma.priceBookItem.create({
      data: {
        categoryId,
        type: "SERVICE",
        name: row.name,
        sku: row.sku,
        unit: row.unit,
        unitPrice: migrated.unitPrice > 0 ? migrated.unitPrice : row.defaultUnitPrice ?? 0,
        unitCost: migrated.unitCost,
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
        active: true,
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
