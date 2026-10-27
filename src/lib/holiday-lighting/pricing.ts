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
  kind: "roofline" | "tree" | "bush" | "lift";
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
  optionDetails: Record<HolidayQuoteOptionKey, {
    displayLines: HolidayDisplayLine[];
    includedLines: HolidayDisplayLine[];
    partsPrice: number;
    laborPrice: number;
    calculated: number;
    subtotal: number;
    discountTotal: number;
    total: number;
    contractDiscountTotal?: number;
  }>;
  calculatedReinstallTotal: number;
  customServicesTotal: number;
};

function money(n: number) {
  return Math.round(n * 100) / 100;
}

export function optionDetail(
  calculated: number,
  selections: HolidayQuoteSelections,
  key: HolidayQuoteOptionKey,
  minimumSubtotal = 0,
  automaticDiscountPercent = 0
) {
  const adjustment = selections.optionAdjustments?.[key];
  const requestedSubtotal = adjustment?.price == null || !Number.isFinite(adjustment.price)
    ? calculated : money(Math.max(0, Math.min(9_999_999, adjustment.price)));
  const subtotal = money(Math.max(minimumSubtotal, requestedSubtotal));
  const contractDiscountTotal = money(
    subtotal * Math.max(0, Math.min(100, automaticDiscountPercent)) / 100
  );
  const requested = Math.max(0, Math.min(adjustment?.discountType === "percent" ? 100 : 9_999_999, adjustment?.discountAmount ?? 0));
  const manualDiscountTotal = money(Math.min(
    subtotal - contractDiscountTotal,
    adjustment?.discountType === "percent" ? subtotal * requested / 100 : requested
  ));
  const discountTotal = money(contractDiscountTotal + manualDiscountTotal);
  return {
    calculated,
    subtotal,
    discountTotal,
    total: money(subtotal - discountTotal),
    ...(contractDiscountTotal > 0 ? { contractDiscountTotal } : {}),
  };
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

  const permanentStyle = catalog.lightStyles.find((item) => item.kind === "permanent" || item.key === "permanent");
  const permanentRate = rate(prices, permanentStyle?.permanentSku);

  let roofYear1 = 0;
  let roofReinstall = 0;
  let roofLease = 0;
  let placementsYear1 = 0;
  let placementsReinstall = 0;
  let placementsLease = 0;
  let placementsPermanent = 0;
  const liftRentalTreeLabels: string[] = [];
  const lines: HolidayPricedLine[] = [];

  for (const segment of measurements.segments) {
    const lengthFt = billedSegmentLengthFt(segment);
    if (lengthFt <= 0) continue;
    const plan = Number(segment.horizontalLengthFt ?? segment.lengthFt) || 0;
    const segmentStyle = catalog.lightStyles.find((item) => item.key === (segment.lightStyleKey ?? style?.key)) ?? style;
    const partsRate = rate(prices, segmentStyle?.partsSku ?? segmentStyle?.temporaryYear1Sku);
    const laborRate = rate(prices, segmentStyle?.installSku ?? segmentStyle?.temporaryReinstallSku);
    const segmentLeaseRate = rate(prices, segmentStyle?.leaseSku);
    const partsTotal = money(lengthFt * partsRate);
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
    const strandCount = Math.max(1, Math.min(100, Math.round(Number(placement.strandCount) || 1)));
    const difficulty = placement.difficulty ?? 1;
    const difficultyMultiplier = catalog.difficultyMultipliers?.[difficulty]
      ?? (difficulty === 2 ? 1.25 : difficulty === 3 ? 1.5 : 1);
    const partsAmount = money((item?.unitPrice ?? 0) * strandCount * difficultyMultiplier);
    const baseLaborAmount = money((laborItem?.unitPrice ?? 0) * strandCount * difficultyMultiplier);
    const needsLift = placement.kind === "tree" && placement.liftRentalNeeded === true;
    const liftTreeLabel = placement.label.trim() || "Unnamed tree";
    if (needsLift && !liftRentalTreeLabels.includes(liftTreeLabel)) {
      liftRentalTreeLabels.push(liftTreeLabel);
    }
    const laborAmount = baseLaborAmount;
    const amount = money(partsAmount + laborAmount);
    const leaseBaseAmount = leaseItem && leaseItem.unitPrice > 0
      ? money(leaseItem.unitPrice * strandCount * difficultyMultiplier)
      : money(partsAmount + baseLaborAmount);
    const leaseAmount = leaseBaseAmount;
    placementsYear1 += amount;
    placementsReinstall += laborAmount;
    placementsLease += leaseAmount;
    placementsPermanent += amount;
    lines.push({
      key: placement.id,
      name:
        placement.label.trim() ||
        (placement.kind === "tree" ? "Unnamed tree" : "Unnamed bush"),
      description: placement.label,
      staffDetail: `${strandCount} strand${strandCount === 1 ? "" : "s"} · Difficulty ${difficulty} (${difficultyMultiplier}×)${needsLift ? " · Lift required" : ""}`,
      purchaseTotal: money(amount),
      leaseTotal: money(leaseAmount),
      partsTotal: money(partsAmount),
      laborTotal: money(laborAmount),
      reinstallTotal: money(laborAmount),
      colorPattern: placement.colorPattern,
      lightStyleLabel: "Mini LEDs",
      kind: placement.kind,
      priceBookItemId: item?.id ?? null,
    });
  }

  if (liftRentalTreeLabels.length) {
    const liftAmount = money(rate(prices, catalog.liftRentalSku));
    const liftDescription = `Lift rental required for: ${liftRentalTreeLabels.join(", ")}.`;
    placementsYear1 += liftAmount;
    placementsReinstall += liftAmount;
    placementsLease += liftAmount;
    placementsPermanent += liftAmount;
    lines.push({
      key: "lift-rental",
      name: "Lift rental",
      description: liftDescription,
      staffDetail: `${liftDescription} Charged once per quote.`,
      purchaseTotal: liftAmount,
      leaseTotal: liftAmount,
      partsTotal: 0,
      laborTotal: liftAmount,
      reinstallTotal: liftAmount,
      kind: "lift",
      priceBookItemId: itemId(prices, catalog.liftRentalSku),
    });
  }

  const year1BeforeMin = money(roofYear1 + placementsYear1);
  const calculatedReinstallTotal = money(roofReinstall + placementsReinstall);
  const calculatedLeaseTotal = money(roofLease + placementsLease);
  const permanentBeforeMin = money(billedLengthFt * permanentRate + placementsPermanent);
  const customServicesTotal = money(
    (selections.customServices ?? []).reduce(
      (sum, service) => sum + service.quantity * service.unitPrice,
      0
    )
  );
  const year1Min = defaults?.temporaryYear1Minimum ?? 0;
  const permMin = defaults?.permanentYear1Minimum ?? 0;
  const calculatedYear1Total = money(Math.max(year1BeforeMin, year1Min) + customServicesTotal);
  const calculatedLaborOnlyTotal = money(Math.max(calculatedReinstallTotal, year1Min) + customServicesTotal);
  const calculatedPermanentTotal = money(Math.max(permanentBeforeMin, permMin) + customServicesTotal);
  const optionDetails = {
    buy: optionDetail(calculatedYear1Total, selections, "buy", customServicesTotal),
    lease: optionDetail(
      money(calculatedLeaseTotal + customServicesTotal),
      selections,
      "lease",
      customServicesTotal,
      selections.leaseContractYears === 5 ? 20 : selections.leaseContractYears === 3 ? 10 : 0
    ),
    permanent: optionDetail(calculatedPermanentTotal, selections, "permanent", customServicesTotal),
    labor: optionDetail(calculatedLaborOnlyTotal, selections, "labor", customServicesTotal),
  };
  const rawLabor = money(lines.reduce((sum, line) => sum + line.laborTotal, 0));
  const componentDetails = Object.fromEntries(
    (["buy", "lease", "permanent", "labor"] as const).map((key) => {
      const original = optionDetails[key];
      const base = Math.max(0, original.subtotal - customServicesTotal);
      const laborBase = key === "labor" ? base : Math.min(base, rawLabor);
      const partsBase = key === "labor" ? 0 : money(base - laborBase);
      const adjustment = selections.optionAdjustments?.[key];
      const partsPrice = key === "labor" ? 0 : adjustment?.partsPrice ?? partsBase;
      const laborPrice = adjustment?.laborPrice ?? laborBase;
      const hasComponents = adjustment?.partsPrice != null || adjustment?.laborPrice != null;
      const detail = hasComponents ? optionDetail(
        money(partsPrice + laborPrice + customServicesTotal),
        { ...selections, optionAdjustments: { ...selections.optionAdjustments, [key]: { ...adjustment, price: null } } },
        key, customServicesTotal,
        key === "lease" ? selections.leaseContractYears === 5 ? 20 : selections.leaseContractYears === 3 ? 10 : 0 : 0
      ) : original;
      if (adjustment?.lineItems != null) {
        const manual = adjustment.lineItems;
        const lineSubtotal = money(manual.reduce((sum, line) => sum + (line.kind === "included" ? 0 : line.quantity * line.unitPrice), 0));
        const manualDetail = optionDetail(money(lineSubtotal + customServicesTotal),
          { ...selections, optionAdjustments: { ...selections.optionAdjustments, [key]: { ...adjustment, price: null } } },
          key, customServicesTotal, key === "lease" ? selections.leaseContractYears === 5 ? 20 : selections.leaseContractYears === 3 ? 10 : 0 : 0);
        return [key, { ...manualDetail, includedLines: [],
          partsPrice: money(manual.filter((line) => line.kind === "parts").reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)),
          laborPrice: money(manual.filter((line) => line.kind === "labor").reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)),
          displayLines: manual.map((line) => ({ ...line, total: line.kind === "included" ? 0 : money(line.quantity * line.unitPrice), itemType: line.kind === "parts" ? "PRODUCT" as const : "SERVICE" as const })),
        }];
      }
      return [key, { ...detail, partsPrice, laborPrice, includedLines: holidayIncludedLines(key).map((line) => ({ ...line, total: 0, itemType: "SERVICE" as const })), displayLines: holidayOptionLines({
        lines, key, targetSubtotal: money(detail.subtotal - customServicesTotal),
        ...(hasComponents ? { partsPrice, laborPrice } : {}),
      }) }];
    })
  ) as HolidayPricingResult["optionDetails"];
  const year1Total = componentDetails.buy.total;
  const leaseTotal = componentDetails.lease.total;
  const permanentTotal = componentDetails.permanent.total;
  const manualBuy = selections.optionAdjustments?.buy?.lineItems;
  const reinstallTotal = manualBuy != null ? componentDetails.buy.laborPrice : selections.reinstallPrice == null ? calculatedReinstallTotal : money(selections.reinstallPrice);

  return {
    lines,
    billedLengthFt,
    placementCount: measurements.placements.length,
    year1Total,
    reinstallTotal,
    leaseTotal,
    permanentTotal,
    year1MinimumApplied: year1Min > year1BeforeMin,
    permanentMinimumApplied: permMin > permanentBeforeMin,
    purchaseTotal: year1Total,
    purchaseSubtotal: money(year1BeforeMin + customServicesTotal),
    leaseSubtotal: leaseTotal,
    marginPct: 0,
    optionDetails: componentDetails,
    calculatedReinstallTotal,
    customServicesTotal,
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
  placementCount: number;
  styleLabel: string;
  hasRoofline?: boolean;
  customServiceCount?: number;
}) {
  const roofline = params.hasRoofline === false ? "" : `${params.styleLabel} roofline lighting`;
  const plants =
    params.placementCount > 0
      ? `${roofline ? " plus " : ""}${params.placementCount} tree${params.placementCount === 1 ? "" : "s"}/bush${params.placementCount === 1 ? "" : "es"}`
      : "";
  const services = (params.customServiceCount ?? 0) > 0
    ? `${roofline || plants ? " plus " : ""}${params.customServiceCount} additional service${params.customServiceCount === 1 ? "" : "s"}`
    : "";
  return `${roofline}${plants}${services}.`;
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
      name: "Labor",
      description: "In future years, since you already own the lights, we would charge only this amount to install, take down, and store the lights for you.",
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

  const rooflines = params.lines.filter((line) => line.kind === "roofline");
  const placements = params.lines.filter((line) => line.kind === "tree" || line.kind === "bush");
  const liftLines = params.lines.filter((line) => line.kind === "lift");
  if (rooflines.length) {
    const selections = [...new Set(
      rooflines
        .map((line) => [line.lightStyleLabel, line.colorPattern].filter(Boolean).join(" · "))
        .filter(Boolean)
    )];
    const lights = selections.length ? ` Lights: ${selections.join("; ")}.` : "";
    result.push({
      name: "Roofline — parts",
      description: `Customer-owned holiday lighting and materials.${lights}`,
      total: money(rooflines.reduce((sum, line) => sum + line.partsTotal, 0)),
      itemType: "PRODUCT",
    });
    result.push({
      name: "Roofline — labor",
      description: `In future years, since you already own the lights, we would charge only this amount to install, take down, and store the lights for you.${lights}`,
      total: money(rooflines.reduce((sum, line) => sum + line.laborTotal, 0)),
      itemType: "SERVICE",
    });
  }

  for (const line of placements) {
    const selection = [line.lightStyleLabel, line.colorPattern].filter(Boolean).join(" · ");
    const lights = selection ? ` Lights: ${selection}.` : "";
    result.push({
      name: `${line.name} — parts`,
      description: `Customer-owned holiday lighting and materials.${lights}`,
      total: line.partsTotal,
      itemType: "PRODUCT",
    });
    result.push({
      name: `${line.name} — labor`,
      description: `In future years, since you already own the lights, we would charge only this amount to install, take down, and store the lights for you.${lights}`,
      total: line.laborTotal,
      itemType: "SERVICE",
    });
  }
  for (const line of liftLines) {
    result.push({
      name: line.name,
      description: line.description,
      total: line.laborTotal,
      itemType: "SERVICE",
    });
  }
  const detailedTotal = money(result.reduce((sum, line) => sum + line.total, 0));
  const adjustment = money(params.targetSubtotal - detailedTotal);
  if (adjustment !== 0 && result.length) {
    // Quote/minimum reconciliation is internal. Fold it into the roofline parts
    // amount (or the first available row) instead of exposing an adjustment.
    const index = result.findIndex((line) => line.name === "Roofline — parts");
    const target = index >= 0 ? index : 0;
    result[target] = { ...result[target]!, total: money(result[target]!.total + adjustment) };
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
  }> = [];
  const rooflines = params.lines.filter((line) => line.kind === "roofline");
  const placements = params.lines.filter((line) => line.kind === "tree" || line.kind === "bush");
  const liftLines = params.lines.filter((line) => line.kind === "lift");

  if (rooflines.length) {
    const selections = [...new Set(
      rooflines
        .map((line) => [line.lightStyleLabel, line.colorPattern].filter(Boolean).join(" · "))
        .filter(Boolean)
    )];
    const lights = selections.length ? ` Customer-supplied lights: ${selections.join("; ")}.` : "";
    result.push({
      name: "Roofline — labor only",
      description: `Installation and take-down labor for customer-supplied lights. Lights and materials are not included.${lights}`,
      total: money(rooflines.reduce((sum, line) => sum + line.laborTotal, 0)),
      itemType: "SERVICE",
    });
  }

  for (const line of placements) {
    const selection = [line.lightStyleLabel, line.colorPattern].filter(Boolean).join(" · ");
    const lights = selection ? ` Customer-supplied lights: ${selection}.` : "";
    result.push({
      name: `${line.name} — labor only`,
      description: `Installation and take-down labor for customer-supplied lights. Lights and materials are not included.${lights}`,
      total: line.laborTotal,
      itemType: "SERVICE" as const,
    });
  }
  for (const line of liftLines) {
    result.push({
      name: line.name,
      description: line.description,
      total: line.reinstallTotal,
      itemType: "SERVICE",
    });
  }
  const detailedTotal = money(result.reduce((sum, line) => sum + line.total, 0));
  const adjustment = money(params.targetSubtotal - detailedTotal);
  if (adjustment !== 0 && result.length) {
    // Keep minimum/manual-price reconciliation internal and make the visible
    // labor rows add up to the customer-facing option subtotal.
    const index = result.findIndex((line) => line.name === "Roofline — labor only");
    const target = index >= 0 ? index : 0;
    result[target] = { ...result[target]!, total: money(result[target]!.total + adjustment) };
  }
  return result;
}

export const HOLIDAY_INCLUDED_LINES = [
  { name: "Takedown", description: "Seasonal light removal is included." },
  {
    name: "Storage",
    description: "We keep your lights in our warehouse in their own labeled bin so they never get lost, and so we can streamline your lighting installation next year.",
  },
  {
    name: "Maintenance",
    description: "If a bulb goes out or a cord gets out of place, call us and we will be there within 48 hours to fix the issue at no cost.",
  },
  {
    name: "3-year parts and labor warranty",
    description: "If anything goes wrong during the three-year warranty period, we will make it right at no cost to you.",
  },
] as const;

export const HOLIDAY_PERMANENT_INCLUDED_LINES = [
  {
    name: "5-year parts and labor warranty",
    description: "If anything goes wrong during the five-year warranty period, we will make it right at no cost to you.",
  },
] as const;

export const HOLIDAY_LEASE_INCLUDED_LINES = [
  ...HOLIDAY_INCLUDED_LINES.filter((line) => !/warranty/i.test(line.name)),
  {
    name: "Lifetime parts and labor warranty",
    description:
      "For as long as your lease remains active, if anything goes wrong, we will make it right at no cost to you.",
  },
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

export type HolidayDisplayLine = { id?: string; quantity?: number; unitPrice?: number; kind?: "parts" | "labor" | "service" | "included"; name: string; description: string; total: number; itemType: "PRODUCT" | "SERVICE" };

/** Shared native preview and estimate breakdown, including explicit zero-dollar overrides. */
export function holidayOptionLines(params: {
  lines: HolidayPricedLine[]; key: HolidayQuoteOptionKey; targetSubtotal: number;
  partsPrice?: number; laborPrice?: number;
}): HolidayDisplayLine[] {
  const liftLine = params.lines.find((line) => line.kind === "lift");
  const liftTotal = liftLine
    ? params.key === "lease"
      ? liftLine.leaseTotal
      : params.key === "permanent"
        ? liftLine.purchaseTotal
        : 0
    : 0;
  const visibleLiftTotal = money(Math.min(Math.max(0, params.targetSubtotal), liftTotal));
  const result: HolidayDisplayLine[] = params.key === "labor"
    ? holidayDetailedLaborOnlyLines(params)
    : params.key === "buy" ? holidayDetailedBuyLines(params)
    : [
        {
          name: "Holiday lighting",
          description: "Holiday lighting installation",
          total: money(params.targetSubtotal - visibleLiftTotal),
          itemType: "SERVICE",
        },
        ...(liftLine
          ? [{
              name: liftLine.name,
              description: liftLine.description,
              total: visibleLiftTotal,
              itemType: "SERVICE" as const,
            }]
          : []),
      ];
  if (params.partsPrice == null && params.laborPrice == null) return result;
  if (params.key === "lease" || params.key === "permanent") {
    const lift = result.find((line) => line.name === "Lift rental");
    result.length = 0;
    if (lift) {
      const serviceTarget = money(Math.max(0, params.laborPrice ?? 0));
      const allocatedLift = money(Math.min(serviceTarget, Math.max(0, lift.total)));
      if (serviceTarget > allocatedLift) {
        result.push({
          name: "Labor",
          description: "Holiday lighting",
          total: money(serviceTarget - allocatedLift),
          itemType: "SERVICE",
        });
      }
      result.push({ ...lift, total: allocatedLift });
    }
  }
  for (const type of ["PRODUCT", "SERVICE"] as const) {
    const target = type === "PRODUCT" ? params.partsPrice ?? 0 : params.laborPrice ?? 0;
    const rows = result.filter((line) => line.itemType === type);
    if (!rows.length && target > 0) {
      result.push({ name: type === "PRODUCT" ? "Parts" : "Labor", description: "Holiday lighting", total: target, itemType: type });
      continue;
    }
    const total = rows.reduce((sum, line) => sum + Math.max(0, line.total), 0);
    let allocated = 0;
    rows.forEach((line, index) => {
      line.total = index === rows.length - 1 ? money(target - allocated)
        : Math.floor(Math.round(target * 100) * (total > 0 ? Math.max(0, line.total) / total : 1 / rows.length)) / 100;
      allocated = money(allocated + line.total);
    });
  }
  return result;
}

export function holidayIncludedLines(key: HolidayQuoteOptionKey) {
  return key === "permanent" ? HOLIDAY_PERMANENT_INCLUDED_LINES
    : key === "lease" ? HOLIDAY_LEASE_INCLUDED_LINES
    : key === "labor" ? HOLIDAY_INCLUDED_LINES.filter((line) => line.name === "Takedown") : HOLIDAY_INCLUDED_LINES;
}
