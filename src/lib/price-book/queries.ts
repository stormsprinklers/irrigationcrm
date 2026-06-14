import type { PriceBookItemType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeItemBreakdown } from "@/lib/price-book/pricing";
import { toNumber } from "@/lib/visits/totals";

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function serializeLaborRate(rate: {
  id: string;
  name: string;
  hourlyCost: Prisma.Decimal;
  hourlyPrice: Prisma.Decimal;
  isDefault: boolean;
  sortOrder: number;
}) {
  return {
    id: rate.id,
    name: rate.name,
    hourlyCost: toNumber(rate.hourlyCost),
    hourlyPrice: toNumber(rate.hourlyPrice),
    isDefault: rate.isDefault,
    sortOrder: rate.sortOrder,
  };
}

export async function serializeItem(
  item: Prisma.PriceBookItemGetPayload<{
    include: {
      category: { select: { id: true; name: true; slug: true; type: true; companyId: true } };
      laborRatePreset: true;
      serviceMaterials: {
        include: {
          materialItem: {
            select: {
              id: true;
              name: true;
              sku: true;
              unitPrice: true;
              unitCost: true;
              markupEnabled: true;
              unit: true;
            };
          };
        };
      };
    };
  }>
) {
  const computed = await computeItemBreakdown(item);

  return {
    id: item.id,
    categoryId: item.categoryId,
    type: item.type,
    name: item.name,
    description: item.description,
    sku: item.sku,
    imageUrl: item.imageUrl,
    unitPrice: toNumber(item.unitPrice),
    unitCost: item.unitCost != null ? toNumber(item.unitCost) : null,
    unit: item.unit,
    taxable: item.taxable,
    markupEnabled: item.markupEnabled,
    laborRate: item.laborRate != null ? toNumber(item.laborRate) : null,
    laborRateId: item.laborRateId,
    laborHours: item.laborHours != null ? toNumber(item.laborHours) : null,
    pricingMode: item.pricingMode,
    lastCalculatedPrice:
      item.lastCalculatedPrice != null ? toNumber(item.lastCalculatedPrice) : null,
    trackMaterials: item.trackMaterials,
    active: item.active,
    sortOrder: item.sortOrder,
    category: {
      id: item.category.id,
      name: item.category.name,
      slug: item.category.slug,
      type: item.category.type,
    },
    laborRatePreset: item.laborRatePreset ? serializeLaborRate(item.laborRatePreset) : null,
    priceBreakdown: computed?.breakdown ?? null,
    materials: item.serviceMaterials.map((link) => ({
      id: link.id,
      materialItemId: link.materialItemId,
      quantity: toNumber(link.quantity),
      material: {
        id: link.materialItem.id,
        name: link.materialItem.name,
        sku: link.materialItem.sku,
        unitPrice: toNumber(link.materialItem.unitPrice),
        unitCost: link.materialItem.unitCost != null ? toNumber(link.materialItem.unitCost) : null,
        markupEnabled: link.materialItem.markupEnabled,
        unit: link.materialItem.unit,
      },
    })),
  };
}

export function serializeCategory(
  category: Prisma.PriceBookCategoryGetPayload<{ include: { _count: { select: { items: true; children: true } } } }>
) {
  return {
    id: category.id,
    type: category.type,
    name: category.name,
    slug: category.slug,
    parentId: category.parentId,
    sortOrder: category.sortOrder,
    _count: category._count,
  };
}

const itemInclude = {
  category: { select: { id: true, name: true, slug: true, type: true, companyId: true } },
  laborRatePreset: true,
  serviceMaterials: {
    include: {
      materialItem: {
        select: {
          id: true,
          name: true,
          sku: true,
          unitPrice: true,
          unitCost: true,
          markupEnabled: true,
          unit: true,
        },
      },
    },
  },
} as const;

export async function ensureCategoryPath(
  companyId: string,
  itemType: PriceBookItemType,
  segments: string[]
): Promise<string> {
  const path = segments.map((s) => s.trim()).filter(Boolean);
  if (path.length === 0) {
    throw new Error("Category path is required");
  }

  let parentId: string | null = null;
  let slugBase = itemType.toLowerCase();

  for (const segment of path) {
    const nextSlug = `${slugBase}-${slugify(segment)}`;
    const existing = await prisma.priceBookCategory.findFirst({
      where: { companyId, slug: nextSlug },
    });

    if (existing) {
      parentId = existing.id;
      slugBase = nextSlug;
      continue;
    }

    parentId = (
      await prisma.priceBookCategory.create({
        data: {
          companyId,
          type: itemType,
          name: segment,
          slug: nextSlug,
          parentId,
          sortOrder: 0,
        },
      })
    ).id;
    slugBase = nextSlug;
  }

  return parentId!;
}

export async function listRootCategories(companyId: string, type: PriceBookItemType) {
  const rows = await prisma.priceBookCategory.findMany({
    where: { companyId, type, parentId: null },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { items: true, children: true } } },
  });
  return rows.map(serializeCategory);
}

export async function getCategory(companyId: string, categoryId: string) {
  const row = await prisma.priceBookCategory.findFirst({
    where: { id: categoryId, companyId },
    include: {
      parent: { select: { id: true, name: true, slug: true } },
      children: {
        orderBy: { sortOrder: "asc" },
        include: { _count: { select: { items: true, children: true } } },
      },
      _count: { select: { items: true, children: true } },
    },
  });
  if (!row) return null;
  return {
    ...serializeCategory(row),
    parent: row.parent,
    children: row.children.map(serializeCategory),
  };
}

export async function listItems(params: {
  companyId: string;
  type?: PriceBookItemType;
  categoryId?: string;
  q?: string;
  activeOnly?: boolean;
}) {
  const rows = await prisma.priceBookItem.findMany({
    where: {
      ...(params.activeOnly !== false ? { active: true } : {}),
      category: { companyId: params.companyId },
      ...(params.type ? { type: params.type } : {}),
      ...(params.categoryId ? { categoryId: params.categoryId } : {}),
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: "insensitive" } },
              { description: { contains: params.q, mode: "insensitive" } },
              { sku: { contains: params.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: itemInclude,
  });
  return Promise.all(rows.map(serializeItem));
}

export async function getItem(companyId: string, itemId: string) {
  const row = await prisma.priceBookItem.findFirst({
    where: { id: itemId, category: { companyId } },
    include: itemInclude,
  });
  return row ? serializeItem(row) : null;
}

export async function upsertItemMaterials(
  serviceItemId: string,
  materials: Array<{ materialItemId: string; quantity: number }>
) {
  await prisma.priceBookServiceMaterial.deleteMany({ where: { serviceItemId } });
  if (materials.length === 0) return;
  await prisma.priceBookServiceMaterial.createMany({
    data: materials.map((m) => ({
      serviceItemId,
      materialItemId: m.materialItemId,
      quantity: m.quantity,
    })),
  });
}

export async function listLaborRates(companyId: string) {
  const rows = await prisma.laborRate.findMany({
    where: { companyId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(serializeLaborRate);
}

export async function listMarkupTiers(companyId: string) {
  const rows = await prisma.materialMarkupTier.findMany({
    where: { companyId },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map((tier) => ({
    id: tier.id,
    minCost: toNumber(tier.minCost),
    maxCost: tier.maxCost != null ? toNumber(tier.maxCost) : null,
    markupPercent: toNumber(tier.markupPercent),
    sortOrder: tier.sortOrder,
  }));
}
