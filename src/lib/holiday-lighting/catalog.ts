import { prisma } from "@/lib/prisma";
import type { PriceLookup } from "./pricing";
import {
  parseHolidayCatalog,
  type HolidayLightingCatalog,
} from "./types";

export { pathLengthFeet } from "./geo";

export async function loadHolidayCatalog(companyId: string): Promise<HolidayLightingCatalog> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { holidayLightingCatalog: true },
  });
  return parseHolidayCatalog(company?.holidayLightingCatalog);
}

export async function loadHolidayPriceLookup(companyId: string): Promise<PriceLookup> {
  const items = await prisma.priceBookItem.findMany({
    where: {
      category: { companyId },
      sku: { not: null },
    },
    select: { id: true, name: true, sku: true, unitPrice: true, unitCost: true },
  });
  const map: PriceLookup = new Map();
  for (const item of items) {
    if (!item.sku) continue;
    map.set(item.sku, {
      id: item.id,
      name: item.name,
      unitPrice: Number(item.unitPrice),
      unitCost: item.unitCost != null ? Number(item.unitCost) : null,
    });
  }
  return map;
}

export function assertHolidayLightingEnabled(company: {
  holidayLightingFeaturesEnabled?: boolean | null;
}) {
  if (company.holidayLightingFeaturesEnabled !== true) {
    const err = new Error("Holiday lighting tools are disabled for this company");
    (err as Error & { status: number }).status = 403;
    throw err;
  }
}
