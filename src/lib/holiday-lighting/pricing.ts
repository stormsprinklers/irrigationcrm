import type {
  HolidayLightingCatalog,
  HolidayMeasurements,
  HolidayQuoteSelections,
} from "./types";
import { findPlacementCatalogItem } from "./types";
import { billedSegmentLengthFt } from "./pitch-match";

export type PriceLookup = Map<
  string,
  { id: string; name: string; unitPrice: number; unitCost: number | null }
>;

export type HolidayPricedLine = {
  key: string;
  name: string;
  description: string;
  staffDetail: string;
  purchaseTotal: number;
  leaseTotal: number;
  priceBookItemId?: string | null;
};

export type HolidayPricingResult = {
  lines: HolidayPricedLine[];
  billedLengthFt: number;
  placementCount: number;
  year1Total: number;
  reinstallTotal: number;
  leaseTotal: number;
  permanentTotal: number;
  year1MinimumApplied: boolean;
  permanentMinimumApplied: boolean;
  /** Alias of year1Total for older UI. */
  purchaseTotal: number;
  purchaseSubtotal: number;
  leaseSubtotal: number;
  marginPct: number;
};

function money(n: number) {
  return Math.round(n * 100) / 100;
}

function lookup(prices: PriceLookup, sku: string | undefined) {
  if (!sku) return null;
  return prices.get(sku) ?? null;
}

function rate(prices: PriceLookup, sku: string | undefined) {
  return lookup(prices, sku)?.unitPrice ?? 0;
}

function itemId(prices: PriceLookup, sku: string | undefined) {
  return lookup(prices, sku)?.id ?? null;
}

export function totalBilledLengthFt(measurements: HolidayMeasurements) {
  return money(
    measurements.segments.reduce((sum, segment) => sum + billedSegmentLengthFt(segment), 0)
  );
}

export function computeHolidayQuotePricing(params: {
  catalog: HolidayLightingCatalog;
  measurements: HolidayMeasurements;
  selections: HolidayQuoteSelections;
  prices: PriceLookup;
}): HolidayPricingResult {
  const { catalog, measurements, selections, prices } = params;
  const style =
    catalog.lightStyles.find((s) => s.key === selections.defaultLightStyleKey) ??
    catalog.lightStyles[0];
  const defaults = catalog.quoteDefaults;
  const billedLengthFt = totalBilledLengthFt(measurements);

  const year1Rate = rate(prices, style?.temporaryYear1Sku);
  const reinstallRate = rate(prices, style?.temporaryReinstallSku);
  const leaseRate = rate(prices, style?.leaseSku);
  const permanentRate = rate(prices, style?.permanentSku);

  let placementsYear1 = 0;
  let placementsReinstall = 0;
  let placementsLease = 0;
  let placementsPermanent = 0;
  const lines: HolidayPricedLine[] = [];

  for (const segment of measurements.segments) {
    const lengthFt = billedSegmentLengthFt(segment);
    if (lengthFt <= 0) continue;
    const plan = Number(segment.horizontalLengthFt ?? segment.lengthFt) || 0;
    lines.push({
      key: segment.id,
      name: segment.label,
      description: `${Math.round(lengthFt)} ft${segment.hasPeak ? " including peak" : ""}`,
      staffDetail: segment.hasPeak
        ? `${plan.toFixed(1)} ft × 1.5 peak = ${lengthFt.toFixed(1)} ft`
        : `${lengthFt.toFixed(1)} ft`,
      purchaseTotal: money(lengthFt * year1Rate),
      leaseTotal: money(lengthFt * leaseRate),
      priceBookItemId: itemId(prices, style?.temporaryYear1Sku),
    });
  }

  for (const placement of measurements.placements) {
    const catalogItem = findPlacementCatalogItem(catalog, placement);
    if (!catalogItem) continue;
    const item = lookup(prices, catalogItem.sku);
    const leaseItem = lookup(prices, catalogItem.leaseSku);
    const amount = item?.unitPrice ?? 0;
    const leaseAmount =
      leaseItem && leaseItem.unitPrice > 0 ? leaseItem.unitPrice : amount;
    placementsYear1 += amount;
    placementsReinstall += amount;
    placementsLease += leaseAmount;
    placementsPermanent += amount;
    lines.push({
      key: placement.id,
      name: `${catalogItem.label} — ${placement.label}`,
      description: placement.label,
      staffDetail: `Each @ $${amount.toFixed(2)}`,
      purchaseTotal: money(amount),
      leaseTotal: money(leaseAmount),
      priceBookItemId: item?.id ?? null,
    });
  }

  const year1BeforeMin = money(billedLengthFt * year1Rate + placementsYear1);
  const reinstallTotal = money(billedLengthFt * reinstallRate + placementsReinstall);
  const leaseTotal = money(billedLengthFt * leaseRate + placementsLease);
  const permanentBeforeMin = money(billedLengthFt * permanentRate + placementsPermanent);
  const year1Min = defaults?.temporaryYear1Minimum ?? 0;
  const permMin = defaults?.permanentYear1Minimum ?? 0;
  const year1Total = money(Math.max(year1BeforeMin, year1Min));
  const permanentTotal = money(Math.max(permanentBeforeMin, permMin));

  return {
    lines,
    billedLengthFt,
    placementCount: measurements.placements.length,
    year1Total,
    reinstallTotal,
    leaseTotal,
    permanentTotal,
    year1MinimumApplied: year1Total > year1BeforeMin,
    permanentMinimumApplied: permanentTotal > permanentBeforeMin,
    purchaseTotal: year1Total,
    purchaseSubtotal: year1BeforeMin,
    leaseSubtotal: leaseTotal,
    marginPct: 0,
  };
}

/** @deprecated Customer quotes use a single flat total per option. */
export function applyMarginToLines(
  lines: HolidayPricedLine[],
  field: "purchaseTotal" | "leaseTotal",
  _marginPct: number
): Array<HolidayPricedLine & { customerTotal: number }> {
  return lines.map((line) => ({
    ...line,
    customerTotal: money(line[field]),
  }));
}

export function holidayOptionSummary(params: {
  billedLengthFt: number;
  placementCount: number;
  styleLabel: string;
}) {
  const feet = `${Math.round(params.billedLengthFt)} ft of ${params.styleLabel} roofline lighting`;
  const plants =
    params.placementCount > 0
      ? ` plus ${params.placementCount} tree${params.placementCount === 1 ? "" : "s"}/bush${params.placementCount === 1 ? "" : "es"}`
      : "";
  return `${feet}${plants}.`;
}

function formatHolidayMoney(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export const HOLIDAY_BUY_DETAIL =
  "Purchasing lights front-loads the cost, but allows you to own the lights so you pay less in future years. This includes installation and take-down as well as any bulb replacements during the season.";

export const HOLIDAY_LEASE_DETAIL =
  "Leasing lights is less up front cost but can be more costly long-term. This lets you change the colors and design each year to fit your preferences. This includes installation and take-down as well as any bulb replacements during the season.";

export const HOLIDAY_PERMANENT_DETAIL =
  "Permanent Lights are the most costly up-front, but then you have them year-round: change the color with an app to show support for your favorite team, raise awareness for a cause you care about, and celebrate holidays like Halloween, Thanksgiving, Valentine's Day, and 4th of July with festive lights — not just Christmas.";

/** @deprecated Use HOLIDAY_LEASE_DETAIL. */
export const HOLIDAY_LEASE_INCLUDED = HOLIDAY_LEASE_DETAIL;

function packageDescription(tagline: string, detail: string, summary: string) {
  return `${tagline}\n\n${detail} ${summary}`.trim();
}

export function holidayCustomerPackages(params: {
  year1Total: number;
  reinstallTotal: number;
  leaseTotal: number;
  permanentTotal: number;
  summary: string;
}) {
  const futureYears = `Future Years: ${formatHolidayMoney(params.reinstallTotal)}`;
  return [
    {
      letter: "A" as const,
      label: "Buy Lights",
      tagline: futureYears,
      popular: false,
      description: packageDescription(futureYears, HOLIDAY_BUY_DETAIL, params.summary),
      total: params.year1Total,
      sortOrder: 0,
    },
    {
      letter: "B" as const,
      label: "Lease Lights",
      tagline: "No Commitments!",
      popular: true,
      description: packageDescription("No Commitments!", HOLIDAY_LEASE_DETAIL, params.summary),
      total: params.leaseTotal,
      sortOrder: 1,
    },
    {
      letter: "C" as const,
      label: "Permanent Lights",
      tagline: "Fit Your Vibe Year-Round",
      popular: false,
      description: packageDescription(
        "Fit Your Vibe Year-Round",
        HOLIDAY_PERMANENT_DETAIL,
        params.summary
      ),
      total: params.permanentTotal,
      sortOrder: 2,
    },
  ];
}
