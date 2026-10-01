import type {
  HolidayLightingCatalog,
  HolidayMeasurements,
  HolidayQuoteSelections,
  HolidayQuoteOptionKey,
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
  partsTotal: number;
  laborTotal: number;
  reinstallTotal: number;
  colorPattern?: string;
  lightStyleLabel?: string;
  kind: "roofline" | "tree" | "bush";
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
  optionDetails: Record<HolidayQuoteOptionKey, { calculated: number; subtotal: number; discountTotal: number; total: number }>;
  calculatedReinstallTotal: number;
};

function money(n: number) {
  return Math.round(n * 100) / 100;
}

export function optionDetail(calculated: number, selections: HolidayQuoteSelections, key: HolidayQuoteOptionKey) {
  const adjustment = selections.optionAdjustments?.[key];
  const subtotal = adjustment?.price == null || !Number.isFinite(adjustment.price)
    ? calculated : money(Math.max(0, Math.min(9_999_999, adjustment.price)));
  const requested = Math.max(0, Math.min(adjustment?.discountType === "percent" ? 100 : 9_999_999, adjustment?.discountAmount ?? 0));
  const discountTotal = money(Math.min(subtotal, adjustment?.discountType === "percent" ? subtotal * requested / 100 : requested));
  return { calculated, subtotal, discountTotal, total: money(subtotal - discountTotal) };
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
  const laborOnly = selections.billingMode === "labor_only" && style?.kind !== "permanent";
  const billedLengthFt = totalBilledLengthFt(measurements);

  const permanentStyle = catalog.lightStyles.find((item) => item.kind === "permanent" || item.key === "permanent");
  const permanentRate = rate(prices, permanentStyle?.permanentSku);

  let roofYear1 = 0;
  let roofReinstall = 0;
  let roofLease = 0;
  let placementsYear1 = 0;
  let placementsReinstall = 0;
  let placementsLease = 0;
  let placementsPermanent = 0;
  const lines: HolidayPricedLine[] = [];

  for (const segment of measurements.segments) {
    const lengthFt = billedSegmentLengthFt(segment);
    if (lengthFt <= 0) continue;
    const plan = Number(segment.horizontalLengthFt ?? segment.lengthFt) || 0;
    const segmentStyle = catalog.lightStyles.find((item) => item.key === (segment.lightStyleKey ?? style?.key)) ?? style;
    const partsRate = rate(prices, segmentStyle?.partsSku ?? segmentStyle?.temporaryYear1Sku);
    const laborRate = rate(prices, segmentStyle?.installSku ?? segmentStyle?.temporaryReinstallSku);
    const segmentLeaseRate = rate(prices, segmentStyle?.leaseSku);
    const partsTotal = laborOnly ? 0 : money(lengthFt * partsRate);
    const laborTotal = money(lengthFt * laborRate);
    const leaseTotal = money(lengthFt * segmentLeaseRate);
    roofYear1 += partsTotal + laborTotal;
    roofReinstall += laborTotal;
    roofLease += leaseTotal;
    lines.push({
      key: segment.id,
      name: segment.label,
      description: `${Math.round(lengthFt)} ft${segment.hasPeak ? " including peak" : ""}`,
      staffDetail: segment.hasPeak
        ? `${plan.toFixed(1)} ft × 1.5 peak = ${lengthFt.toFixed(1)} ft`
        : `${lengthFt.toFixed(1)} ft`,
      purchaseTotal: money(partsTotal + laborTotal),
      leaseTotal,
      partsTotal,
      laborTotal,
      reinstallTotal: laborTotal,
      colorPattern: segment.colorPattern ?? selections.defaultColorPattern,
      lightStyleLabel: segmentStyle?.label,
      kind: "roofline",
      priceBookItemId: itemId(prices, segmentStyle?.partsSku ?? segmentStyle?.temporaryYear1Sku),
    });
  }

  for (const placement of measurements.placements) {
    const catalogItem = findPlacementCatalogItem(catalog, placement);
    if (!catalogItem) continue;
    const item = lookup(prices, catalogItem.partsSku ?? catalogItem.sku);
    const laborItem = lookup(prices, catalogItem.installSku);
    const leaseItem = lookup(prices, catalogItem.leaseSku);
    const partsAmount = laborOnly ? 0 : item?.unitPrice ?? 0;
    const laborAmount = laborItem?.unitPrice ?? 0;
    const amount = partsAmount + laborAmount;
    const placementStyle = catalog.lightStyles.find((item) => item.key === placement.lightStyleKey);
    const leaseAmount =
      leaseItem && leaseItem.unitPrice > 0 ? leaseItem.unitPrice : amount;
    placementsYear1 += amount;
    placementsReinstall += laborAmount;
    placementsLease += leaseAmount;
    placementsPermanent += amount;
    lines.push({
      key: placement.id,
      name: `${placement.kind === "tree" ? "Tree" : "Bush"} wrap — ${placement.size} — ${placement.label}`,
      description: placement.label,
      staffDetail: `Difficulty ${placement.difficulty ?? 1} · each @ $${amount.toFixed(2)}`,
      purchaseTotal: money(amount),
      leaseTotal: money(leaseAmount),
      partsTotal: money(partsAmount),
      laborTotal: money(laborAmount),
      reinstallTotal: money(laborAmount),
      colorPattern: placement.colorPattern,
      lightStyleLabel: placementStyle?.label,
      kind: placement.kind,
      priceBookItemId: item?.id ?? null,
    });
  }

  const year1BeforeMin = money(roofYear1 + placementsYear1);
  const calculatedReinstallTotal = money(roofReinstall + placementsReinstall);
  const calculatedLeaseTotal = money(roofLease + placementsLease);
  const permanentBeforeMin = money(billedLengthFt * permanentRate + placementsPermanent);
  const year1Min = defaults?.temporaryYear1Minimum ?? 0;
  const permMin = defaults?.permanentYear1Minimum ?? 0;
  const calculatedYear1Total = money(Math.max(year1BeforeMin, year1Min));
  const calculatedPermanentTotal = money(Math.max(permanentBeforeMin, permMin));
  const optionDetails = {
    buy: optionDetail(calculatedYear1Total, selections, "buy"),
    lease: optionDetail(calculatedLeaseTotal, selections, "lease"),
    permanent: optionDetail(calculatedPermanentTotal, selections, "permanent"),
  };
  const year1Total = optionDetails.buy.total;
  const leaseTotal = optionDetails.lease.total;
  const permanentTotal = optionDetails.permanent.total;
  const reinstallTotal = selections.reinstallPrice == null ? calculatedReinstallTotal : money(selections.reinstallPrice);

  return {
    lines,
    billedLengthFt,
    placementCount: measurements.placements.length,
    year1Total,
    reinstallTotal,
    leaseTotal,
    permanentTotal,
    year1MinimumApplied: calculatedYear1Total > year1BeforeMin,
    permanentMinimumApplied: calculatedPermanentTotal > permanentBeforeMin,
    purchaseTotal: year1Total,
    purchaseSubtotal: year1BeforeMin,
    leaseSubtotal: leaseTotal,
    marginPct: 0,
    optionDetails,
    calculatedReinstallTotal,
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

export function holidayBuyBreakdownLines(params: {
  year1Subtotal: number;
  year2LaborTotal: number;
}) {
  const laborTotal = money(Math.max(0, params.year2LaborTotal));
  const partsTotal = money(Math.max(0, params.year1Subtotal) - laborTotal);
  return [
    {
      name: "Parts",
      description: "Customer-owned holiday lighting and materials.",
      total: partsTotal,
      itemType: "PRODUCT" as const,
    },
    {
      name: "Labor (Year 2 cost)",
      description: "Installation and take-down labor. This same amount is the Year 2 service cost.",
      total: laborTotal,
      itemType: "SERVICE" as const,
    },
  ];
}

export function holidayDetailedBuyLines(params: {
  lines: HolidayPricedLine[];
  targetSubtotal: number;
}) {
  const result: Array<{
    name: string;
    description: string;
    total: number;
    itemType: "PRODUCT" | "SERVICE";
  }> = [];
  for (const line of params.lines) {
    const subject = line.kind === "roofline" ? `Roofline — ${line.name}` : line.name;
    const selection = [line.lightStyleLabel, line.colorPattern].filter(Boolean).join(" · ");
    const color = selection ? ` Lights: ${selection}.` : "";
    result.push({
      name: `${subject} — parts`,
      description: `Customer-owned holiday lighting and materials.${color}`,
      total: line.partsTotal,
      itemType: "PRODUCT",
    });
    result.push({
      name: `${subject} — labor (Year 2 cost)`,
      description: `Installation and take-down labor. This amount is the Year 2 service cost for this item.${color}`,
      total: line.laborTotal,
      itemType: "SERVICE",
    });
  }
  const detailedTotal = money(result.reduce((sum, line) => sum + line.total, 0));
  const adjustment = money(params.targetSubtotal - detailedTotal);
  if (adjustment !== 0) {
    result.push({
      name: "Quote adjustment",
      description: "Adjustment for the quoted package price or minimum.",
      total: adjustment,
      itemType: "SERVICE",
    });
  }
  return result;
}

export function holidayDetailedLaborOnlyLines(params: {
  lines: HolidayPricedLine[];
  targetSubtotal: number;
}) {
  const result: Array<{
    name: string;
    description: string;
    total: number;
    itemType: "SERVICE";
  }> = params.lines.map((line) => {
    const subject = line.kind === "roofline" ? `Roofline — ${line.name}` : line.name;
    const selection = [line.lightStyleLabel, line.colorPattern].filter(Boolean).join(" · ");
    const lights = selection ? ` Customer-supplied lights: ${selection}.` : "";
    return {
      name: `${subject} — labor only`,
      description: `Installation and take-down labor for customer-supplied lights. Lights and materials are not included.${lights}`,
      total: line.laborTotal,
      itemType: "SERVICE" as const,
    };
  });
  const detailedTotal = money(result.reduce((sum, line) => sum + line.total, 0));
  const adjustment = money(params.targetSubtotal - detailedTotal);
  if (adjustment !== 0) {
    result.push({
      name: "Labor minimum adjustment",
      description: "Adjustment to the quoted labor-only package price or minimum.",
      total: adjustment,
      itemType: "SERVICE",
    });
  }
  return result;
}

export const HOLIDAY_INCLUDED_LINES = [
  { name: "Storage", description: "Included with this holiday lighting package." },
  { name: "Maintenance", description: "Included bulb and lighting maintenance during the season." },
  { name: "3-year warranty", description: "Included three-year warranty." },
] as const;

export const HOLIDAY_BUY_DETAIL =
  "Purchasing lights front-loads the cost, but allows you to own the lights so you pay less in future years. This includes installation and take-down as well as any bulb replacements during the season.";

export const HOLIDAY_LEASE_DETAIL =
  "Leasing lights is less up front cost but can be more costly long-term. This lets you change the colors and design each year to fit your preferences. This includes installation and take-down as well as any bulb replacements during the season.";

export const HOLIDAY_PERMANENT_DETAIL =
  "Permanent Lights are the most costly up-front, but then you have them year-round: change the color with an app to show support for your favorite team, raise awareness for a cause you care about, and celebrate holidays like Halloween, Thanksgiving, Valentine's Day, and 4th of July with festive lights — not just Christmas.";

export const HOLIDAY_LABOR_ONLY_DETAIL =
  "Installation and take-down labor for customer-supplied holiday lights. Lights, bulbs, clips, extension cords, and other materials are not included.";

export const HOLIDAY_LABOR_ONLY_DISCLAIMER =
  "Customer-supplied lights and clips: We are not liable for damage or poor function involving clips, lights, or other materials provided by another company. Visits to replace lights or strands during the season are not included.";

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
