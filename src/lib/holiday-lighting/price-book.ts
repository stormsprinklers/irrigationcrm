import { prisma } from "@/lib/prisma";
import { ensureCategoryPath } from "@/lib/price-book/queries";
import { holidayCatalogSkus, type HolidayBackendCostItem, type HolidayLightingCatalog, type HolidayPriceBookRow } from "./types";

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
      description: true,
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
      if (!found.active || found.name !== row.name || found.description !== (row.description ?? null) || found.unit !== row.unit || shouldApplyDefaultPrice || shouldApplyMigratedCost) {
        const updated = await prisma.priceBookItem.update({
          where: { id: found.id },
          data: {
            name: row.name,
            description: row.description ?? null,
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
            description: true,
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
        description: row.description ?? null,
        sku: row.sku,
        unit: row.unit,
        unitPrice: migrated.unitPrice > 0 ? migrated.unitPrice : row.defaultUnitPrice ?? 0,
        unitCost: migrated.unitCost > 0 ? migrated.unitCost : row.defaultUnitCost ?? 0,
        pricingMode: "MANUAL",
        active: true,
        sortOrder: skus.indexOf(row),
      },
      select: {
        id: true,
        sku: true,
        name: true,
        description: true,
        unit: true,
        unitPrice: true,
        unitCost: true,
        active: true,
      },
    });
    bySku.set(row.sku, created);
  }

  const serviceIds = [...bySku.values()].map((item) => item.id);
  const materialLinks = serviceIds.length
    ? await prisma.priceBookServiceMaterial.findMany({
        where: { serviceItemId: { in: serviceIds } },
        include: {
          materialItem: {
            select: { id: true, name: true, unitCost: true, unitPrice: true },
          },
        },
        orderBy: { id: "asc" },
      })
    : [];
  const linksByService = new Map<string, typeof materialLinks>();
  for (const link of materialLinks) {
    const links = linksByService.get(link.serviceItemId) ?? [];
    links.push(link);
    linksByService.set(link.serviceItemId, links);
  }

  return skus.map((row) => {
    const item = bySku.get(row.sku);
    const backendItems: HolidayBackendCostItem[] = (item ? linksByService.get(item.id) ?? [] : []).map((link) => ({
      id: link.materialItem.id,
      name: link.materialItem.name,
      quantity: Number(link.quantity),
      contractorCost: Number(link.materialItem.unitCost ?? 0),
      msrp: Number(link.materialItem.unitPrice),
    }));
    const contractorCost = backendItems.length
      ? backendItems.reduce((sum, component) => sum + component.quantity * component.contractorCost, 0)
      : Number(item?.unitCost ?? 0);
    const cancellationMsrp = backendItems.length
      ? backendItems.reduce((sum, component) => sum + component.quantity * component.msrp, 0)
      : Number(item?.unitCost ?? 0);
    return {
      sku: row.sku,
      name: row.name,
      description: row.description,
      unit: row.unit,
      unitPrice: item ? Number(item.unitPrice) : 0,
      unitCost: item?.unitCost != null ? Number(item.unitCost) : null,
      priceBookItemId: item?.id ?? null,
      backendItems,
      backendItemsConfigured: backendItems.length > 0,
      contractorCost: Math.round(contractorCost * 100) / 100,
      cancellationMsrp: Math.round(cancellationMsrp * 100) / 100,
    };
  });
}

export async function updateHolidayPriceBookPrices(
  companyId: string,
  prices: Array<{ sku: string; unitPrice?: number; unitCost?: number | null; backendItems?: HolidayBackendCostItem[]; backendItemsConfigured?: boolean }>
) {
  const materialCategoryId = await ensureCategoryPath(companyId, "MATERIAL", ["Holiday lighting components"]);
  for (const row of prices) {
    const sku = row.sku?.trim();
    if (!sku) continue;
    const item = await prisma.priceBookItem.findFirst({
      where: { sku, category: { companyId } },
      select: {
        id: true,
        serviceMaterials: { select: { materialItemId: true } },
      },
    });
    if (!item) continue;
    const backendItems = row.backendItemsConfigured === true && Array.isArray(row.backendItems)
      ? row.backendItems.slice(0, 50).flatMap((component, index) => {
          const name = String(component.name ?? "").trim().slice(0, 160);
          const quantity = Number(component.quantity);
          const contractorCost = Number(component.contractorCost);
          const msrp = Number(component.msrp);
          if (!name || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(contractorCost) || contractorCost < 0 || !Number.isFinite(msrp) || msrp < 0) return [];
          return [{
            id: typeof component.id === "string" ? component.id : `new-${index}`,
            name,
            quantity: Math.min(100000, quantity),
            contractorCost: Math.min(9_999_999, contractorCost),
            msrp: Math.min(9_999_999, msrp),
          }];
        })
      : null;
    const contractorTotal = backendItems?.reduce((sum, component) => sum + component.quantity * component.contractorCost, 0);

    await prisma.$transaction(async (tx) => {
      await tx.priceBookItem.update({
        where: { id: item.id },
        data: {
          ...(row.unitPrice != null && Number.isFinite(row.unitPrice)
            ? { unitPrice: Math.max(0, row.unitPrice) }
            : {}),
          ...(backendItems
            ? { unitCost: Math.round((contractorTotal ?? 0) * 100) / 100 }
            : row.unitCost === null
              ? { unitCost: null }
              : row.unitCost != null && Number.isFinite(row.unitCost)
                ? { unitCost: Math.max(0, row.unitCost) }
                : {}),
        },
      });
      if (!backendItems) return;

      const previousIds = item.serviceMaterials.map((link) => link.materialItemId);
      const reusable = new Set(previousIds);
      await tx.priceBookServiceMaterial.deleteMany({ where: { serviceItemId: item.id } });
      const retainedIds = new Set<string>();
      for (const component of backendItems) {
        const existingId = reusable.has(component.id) ? component.id : null;
        const material = existingId
          ? await tx.priceBookItem.update({
              where: { id: existingId },
              data: {
                name: component.name,
                unitCost: component.contractorCost,
                unitPrice: component.msrp,
                unit: "each",
                active: true,
              },
              select: { id: true },
            })
          : await tx.priceBookItem.create({
              data: {
                categoryId: materialCategoryId,
                type: "MATERIAL",
                name: component.name,
                unitCost: component.contractorCost,
                unitPrice: component.msrp,
                unit: "each",
                pricingMode: "MANUAL",
                active: true,
              },
              select: { id: true },
            });
        retainedIds.add(material.id);
        await tx.priceBookServiceMaterial.create({
          data: { serviceItemId: item.id, materialItemId: material.id, quantity: component.quantity },
        });
      }

      for (const materialItemId of previousIds.filter((id) => !retainedIds.has(id))) {
        const remainingLinks = await tx.priceBookServiceMaterial.count({ where: { materialItemId } });
        if (remainingLinks === 0) {
          await tx.priceBookItem.deleteMany({
            where: { id: materialItemId, categoryId: materialCategoryId },
          });
        }
      }
    });
  }
}
