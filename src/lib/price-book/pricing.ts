import type { MaterialMarkupTier, PriceBookItem, PriceBookPricingMode, LaborRate } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeLineItemTotal, toNumber } from "@/lib/visits/totals";

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export type MarkupTierInput = Pick<MaterialMarkupTier, "minCost" | "maxCost" | "markupPercent">;

export type LaborRateInput = Pick<LaborRate, "hourlyCost" | "hourlyPrice" | "name">;

export type PriceBreakdownLine = {
  label: string;
  amount: number;
};

export type ServicePriceBreakdown = {
  laborSubtotal: number;
  materialsSubtotal: number;
  total: number;
  lines: PriceBreakdownLine[];
};

export function findMarkupTier(cost: number, tiers: MarkupTierInput[]) {
  const sorted = [...tiers].sort((a, b) => toNumber(a.minCost) - toNumber(b.minCost));
  for (const tier of sorted) {
    const min = toNumber(tier.minCost);
    const max = tier.maxCost != null ? toNumber(tier.maxCost) : null;
    if (cost >= min && (max == null || cost <= max)) {
      return tier;
    }
  }
  return null;
}

export function applyMarkup(cost: number, markupPercent: number) {
  return roundMoney(cost * (1 + markupPercent / 100));
}

export function resolveMaterialPrice(params: {
  unitCost: number | null;
  unitPrice: number;
  markupEnabled: boolean;
  markupsEnabled: boolean;
  tiers: MarkupTierInput[];
}) {
  const { unitCost, unitPrice, markupEnabled, markupsEnabled, tiers } = params;
  if (!markupsEnabled || !markupEnabled || unitCost == null) {
    return unitPrice;
  }
  const tier = findMarkupTier(unitCost, tiers);
  if (!tier) return unitPrice;
  return applyMarkup(unitCost, toNumber(tier.markupPercent));
}

export function calculateServiceFlatPrice(params: {
  laborHours: number | null;
  laborRate: LaborRateInput | null;
  inlineLaborRate: number | null;
  materials: Array<{
    name: string;
    quantity: number;
    unitCost: number | null;
    unitPrice: number;
    markupEnabled: boolean;
  }>;
  markupsEnabled: boolean;
  tiers: MarkupTierInput[];
}): ServicePriceBreakdown {
  const lines: PriceBreakdownLine[] = [];
  let laborSubtotal = 0;

  const hours = params.laborHours ?? 0;
  if (params.laborRate && hours > 0) {
    laborSubtotal = roundMoney(toNumber(params.laborRate.hourlyPrice) * hours);
    lines.push({
      label: `${hours}h @ ${params.laborRate.name} ($${toNumber(params.laborRate.hourlyPrice)}/hr)`,
      amount: laborSubtotal,
    });
  } else if (params.inlineLaborRate != null && hours > 0) {
    laborSubtotal = roundMoney(params.inlineLaborRate * hours);
    lines.push({
      label: `${hours}h @ $${params.inlineLaborRate}/hr`,
      amount: laborSubtotal,
    });
  }

  let materialsSubtotal = 0;
  for (const material of params.materials) {
    const unitSell = resolveMaterialPrice({
      unitCost: material.unitCost,
      unitPrice: material.unitPrice,
      markupEnabled: material.markupEnabled,
      markupsEnabled: params.markupsEnabled,
      tiers: params.tiers,
    });
    const lineTotal = roundMoney(unitSell * material.quantity);
    materialsSubtotal += lineTotal;
    lines.push({
      label: `${material.name} × ${material.quantity}`,
      amount: lineTotal,
    });
  }
  materialsSubtotal = roundMoney(materialsSubtotal);

  return {
    laborSubtotal,
    materialsSubtotal,
    total: roundMoney(laborSubtotal + materialsSubtotal),
    lines,
  };
}

export async function getCompanyPricingContext(companyId: string) {
  const [company, tiers] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        flatRatePricingEnabled: true,
        materialMarkupsEnabled: true,
      },
    }),
    prisma.materialMarkupTier.findMany({
      where: { companyId },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  return {
    flatRatePricingEnabled: company?.flatRatePricingEnabled ?? false,
    materialMarkupsEnabled: company?.materialMarkupsEnabled ?? true,
    tiers,
  };
}

const itemPricingInclude = {
  laborRatePreset: true,
  serviceMaterials: {
    include: {
      materialItem: {
        select: {
          id: true,
          name: true,
          unitCost: true,
          unitPrice: true,
          markupEnabled: true,
        },
      },
    },
  },
  category: { select: { companyId: true } },
} as const;

export async function computeItemBreakdown(
  item: Awaited<ReturnType<typeof loadItemForPricing>>
) {
  if (!item) return null;

  const ctx = await getCompanyPricingContext(item.category.companyId);

  if (item.type === "MATERIAL") {
    const price = resolveMaterialPrice({
      unitCost: item.unitCost != null ? toNumber(item.unitCost) : null,
      unitPrice: toNumber(item.unitPrice),
      markupEnabled: item.markupEnabled,
      markupsEnabled: ctx.materialMarkupsEnabled,
      tiers: ctx.tiers,
    });
    return {
      unitPrice: price,
      breakdown: null as ServicePriceBreakdown | null,
    };
  }

  const breakdown = calculateServiceFlatPrice({
    laborHours: item.laborHours != null ? toNumber(item.laborHours) : null,
    laborRate: item.laborRatePreset,
    inlineLaborRate: item.laborRate != null ? toNumber(item.laborRate) : null,
    materials: item.serviceMaterials.map((link) => ({
      name: link.materialItem.name,
      quantity: toNumber(link.quantity),
      unitCost: link.materialItem.unitCost != null ? toNumber(link.materialItem.unitCost) : null,
      unitPrice: toNumber(link.materialItem.unitPrice),
      markupEnabled: link.materialItem.markupEnabled,
    })),
    markupsEnabled: ctx.materialMarkupsEnabled,
    tiers: ctx.tiers,
  });

  return {
    unitPrice: breakdown.total,
    breakdown,
  };
}

export async function loadItemForPricing(itemId: string) {
  return prisma.priceBookItem.findUnique({
    where: { id: itemId },
    include: itemPricingInclude,
  });
}

export async function recalculateItemPrice(itemId: string) {
  const item = await loadItemForPricing(itemId);
  if (!item) return null;

  if (item.type === "MATERIAL" && item.markupEnabled) {
    const computed = await computeItemBreakdown(item);
    if (!computed) return item;
    return prisma.priceBookItem.update({
      where: { id: itemId },
      data: {
        unitPrice: computed.unitPrice,
        lastCalculatedPrice: computed.unitPrice,
      },
    });
  }

  if (item.pricingMode !== "CALCULATED") return item;

  const computed = await computeItemBreakdown(item);
  if (!computed) return item;

  return prisma.priceBookItem.update({
    where: { id: itemId },
    data: {
      unitPrice: computed.unitPrice,
      lastCalculatedPrice: computed.unitPrice,
    },
  });
}

export async function recalculateCalculatedServicesForCompany(companyId: string) {
  const items = await prisma.priceBookItem.findMany({
    where: {
      type: "SERVICE",
      pricingMode: "CALCULATED",
      category: { companyId },
      active: true,
    },
    select: { id: true },
  });

  for (const item of items) {
    await recalculateItemPrice(item.id);
  }
}

export async function recalculateMarkedUpMaterialsForCompany(companyId: string) {
  const items = await prisma.priceBookItem.findMany({
    where: {
      type: "MATERIAL",
      markupEnabled: true,
      category: { companyId },
      active: true,
    },
    select: { id: true },
  });

  for (const item of items) {
    await recalculateItemPrice(item.id);
  }
}

export async function recalculateCalculatedServicesUsingLaborRate(laborRateId: string) {
  const items = await prisma.priceBookItem.findMany({
    where: { laborRateId, pricingMode: "CALCULATED", active: true },
    select: { id: true },
  });
  for (const item of items) {
    await recalculateItemPrice(item.id);
  }
}

export async function recalculateCalculatedServicesUsingMaterial(materialItemId: string) {
  const links = await prisma.priceBookServiceMaterial.findMany({
    where: { materialItemId },
    select: { serviceItemId: true },
  });
  const serviceIds = [...new Set(links.map((l) => l.serviceItemId))];
  for (const id of serviceIds) {
    const item = await prisma.priceBookItem.findUnique({ where: { id } });
    if (item?.pricingMode === "CALCULATED") {
      await recalculateItemPrice(id);
    }
  }
}

export function buildLineItemDescriptionFromBreakdown(breakdown: ServicePriceBreakdown | null) {
  if (!breakdown || breakdown.lines.length === 0) return null;
  return breakdown.lines.map((l) => `${l.label}: $${l.amount.toFixed(2)}`).join(" · ");
}

export async function buildLineItemFromPriceBook(companyId: string, itemId: string) {
  const item = await loadItemForPricing(itemId);
  if (!item || item.category.companyId !== companyId) {
    throw new Error("Price book item not found");
  }

  const computed = await computeItemBreakdown(item);
  if (!computed) throw new Error("Unable to price item");

  const unitPrice =
    item.pricingMode === "MANUAL" ? toNumber(item.unitPrice) : computed.unitPrice;

  return {
    priceBookItemId: item.id,
    name: item.name,
    description:
      item.type === "SERVICE"
        ? buildLineItemDescriptionFromBreakdown(computed.breakdown) ?? item.description
        : item.description,
    quantity: 1,
    unitPrice,
  };
}

export async function bulkAdjustPrices(params: {
  companyId: string;
  percent: number;
  scope: "ALL" | "SERVICES" | "MATERIALS";
  categoryId?: string;
  adjustCost: boolean;
  dryRun: boolean;
}) {
  const factor = 1 + params.percent / 100;
  const where = {
    active: true,
    category: { companyId: params.companyId },
    ...(params.scope === "SERVICES" ? { type: "SERVICE" as const } : {}),
    ...(params.scope === "MATERIALS" ? { type: "MATERIAL" as const } : {}),
    ...(params.categoryId ? { categoryId: params.categoryId } : {}),
  };

  const items = await prisma.priceBookItem.findMany({
    where,
    select: {
      id: true,
      name: true,
      type: true,
      unitPrice: true,
      unitCost: true,
      pricingMode: true,
    },
    take: params.dryRun ? 10 : undefined,
  });

  const count = params.dryRun
    ? await prisma.priceBookItem.count({ where })
    : items.length;

  const preview = items.map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    beforePrice: toNumber(item.unitPrice),
    afterPrice: roundMoney(toNumber(item.unitPrice) * factor),
    beforeCost: item.unitCost != null ? toNumber(item.unitCost) : null,
    afterCost:
      item.unitCost != null && params.adjustCost
        ? roundMoney(toNumber(item.unitCost) * factor)
        : item.unitCost != null
          ? toNumber(item.unitCost)
          : null,
  }));

  if (params.dryRun) {
    return { count, preview, applied: false };
  }

  const allItems = await prisma.priceBookItem.findMany({
    where,
    select: { id: true, unitPrice: true, unitCost: true },
  });

  await prisma.$transaction(
    allItems.map((item) =>
      prisma.priceBookItem.update({
        where: { id: item.id },
        data: {
          unitPrice: roundMoney(toNumber(item.unitPrice) * factor),
          ...(params.adjustCost && item.unitCost != null
            ? { unitCost: roundMoney(toNumber(item.unitCost) * factor) }
            : {}),
        },
      })
    )
  );

  await recalculateCalculatedServicesForCompany(params.companyId);

  return { count: allItems.length, preview: preview.slice(0, 10), applied: true };
}
