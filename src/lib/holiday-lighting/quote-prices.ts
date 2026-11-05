import type { PriceLookup } from "./pricing";
import type { HolidayPricingSnapshot } from "./types";

export function snapshotHolidayPrices(prices: PriceLookup): HolidayPricingSnapshot {
  return Object.fromEntries(
    [...prices.entries()].map(([sku, item]) => [sku, {
      unitPrice: item.unitPrice,
      unitCost: item.unitCost,
    }])
  );
}

export function applyHolidayPricingSnapshot(
  currentPrices: PriceLookup,
  snapshot: HolidayPricingSnapshot | undefined
): PriceLookup {
  if (!snapshot) return currentPrices;
  return new Map(
    [...currentPrices.entries()].map(([sku, item]) => {
      const saved = snapshot[sku];
      return [sku, saved ? { ...item, unitPrice: saved.unitPrice, unitCost: saved.unitCost } : item];
    })
  );
}

export function holidayPricingSnapshotChanged(
  currentPrices: PriceLookup,
  snapshot: HolidayPricingSnapshot | undefined
) {
  if (!snapshot) return false;
  return [...currentPrices.entries()].some(([sku, item]) => {
    const saved = snapshot[sku];
    return Boolean(saved && saved.unitPrice !== item.unitPrice);
  });
}
