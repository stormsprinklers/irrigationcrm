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
  /** Exact company material cost allocated to this scope. */
  cancellationCost: number;
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
  /** Material cost due if a seasonal recurring service is cancelled. */
  cancellationFee: number;
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
  let serviceSubtotal = 0;
  let cancellationFee = 0;
  const lines: HolidayPricedLine[] = [];

  for (const segment of measurements.segments) {
    const lengthFt = billedSegmentLengthFt(segment);
    if (lengthFt <= 0) continue;
    const plan = Number(segment.horizontalLengthFt ?? segment.lengthFt) || 0;
    const segmentStyle = catalog.lightStyles.find((item) => item.key === (segment.lightStyleKey ?? style?.key)) ?? style;
    const sku = segmentStyle?.kind === "permanent"
      ? segmentStyle.permanentSku
      : segmentStyle?.partsSku ?? segmentStyle?.temporaryYear1Sku;
    const price = lookup(prices, sku);
    const serviceTotal = money(lengthFt * (price?.unitPrice ?? 0));
    const materialCost = money(lengthFt * (price?.unitCost ?? 0));
    serviceSubtotal += serviceTotal;
    cancellationFee += materialCost;
    lines.push({
      key: segment.id,
      name: segment.label,
      description: `${Math.round(lengthFt)} ft${segment.hasPeak ? " including peak" : ""}`,
      staffDetail: segment.hasPeak
        ? `${plan.toFixed(1)} ft × 1.5 peak = ${lengthFt.toFixed(1)} ft`
        : `${lengthFt.toFixed(1)} ft`,
      purchaseTotal: serviceTotal,
      leaseTotal: serviceTotal,
      partsTotal: 0,
      laborTotal: serviceTotal,
      reinstallTotal: serviceTotal,
      cancellationCost: materialCost,
      colorPattern: segment.colorPattern ?? selections.defaultColorPattern,
      lightStyleLabel: segmentStyle?.label,
      kind: "roofline",
      priceBookItemId: price?.id ?? null,
    });
  }

  for (const placement of measurements.placements) {
    const catalogItem = findPlacementCatalogItem(catalog, placement);
    if (!catalogItem) continue;
    const item = lookup(prices, catalogItem.sku);
    const strandCount = Math.max(1, Math.min(100, Math.round(Number(placement.strandCount) || 1)));
    const difficulty = placement.difficulty ?? 1;
    const difficultyMultiplier = catalog.difficultyMultipliers?.[difficulty]
      ?? (difficulty === 2 ? 1.25 : difficulty === 3 ? 1.5 : 1);
    const amount = money((item?.unitPrice ?? 0) * strandCount * difficultyMultiplier);
    // Difficulty changes the work price, not the amount of material purchased.
    const materialCost = money((item?.unitCost ?? 0) * strandCount);
    serviceSubtotal += amount;
    cancellationFee += materialCost;
    lines.push({
      key: placement.id,
      name:
        placement.label.trim() ||
        (placement.kind === "tree" ? "Unnamed tree" : "Unnamed bush"),
      description: `${strandCount} strand${strandCount === 1 ? "" : "s"}${
        placement.colorPattern ? ` · ${placement.colorPattern}` : ""
      }`,
      staffDetail: `${strandCount} strand${strandCount === 1 ? "" : "s"} · Difficulty ${difficulty} (${difficultyMultiplier}×)`,
      purchaseTotal: amount,
      leaseTotal: amount,
      partsTotal: 0,
      laborTotal: amount,
      reinstallTotal: amount,
      cancellationCost: materialCost,
      colorPattern: placement.colorPattern,
      lightStyleLabel: "Mini LEDs",
      kind: placement.kind,
      priceBookItemId: item?.id ?? null,
    });
  }
  serviceSubtotal = money(serviceSubtotal);
  // Permanent lighting is a one-time installed system, not a recurring seasonal
  // service. Its backend material cost remains on the price-book row for internal
  // costing, but it must never become a customer cancellation fee.
  cancellationFee = style?.kind === "permanent" ? 0 : money(cancellationFee);
  const customServicesTotal = money(
    (selections.customServices ?? []).reduce(
      (sum, service) => sum + service.quantity * service.unitPrice,
      0
    )
  );
  const minimum = style?.kind === "permanent"
    ? defaults?.permanentYear1Minimum ?? 0
    : defaults?.temporaryYear1Minimum ?? 0;
  const calculatedServiceTotal = money(Math.max(serviceSubtotal, minimum) + customServicesTotal);
  const optionDetails = {
    buy: optionDetail(calculatedServiceTotal, selections, "buy", customServicesTotal),
    lease: optionDetail(calculatedServiceTotal, selections, "lease", customServicesTotal),
    permanent: optionDetail(calculatedServiceTotal, selections, "permanent", customServicesTotal),
    labor: optionDetail(calculatedServiceTotal, selections, "labor", customServicesTotal),
  };
  const componentDetails = Object.fromEntries(
    (["buy", "lease", "permanent", "labor"] as const).map((key) => {
      const original = optionDetails[key];
      const base = Math.max(0, original.subtotal - customServicesTotal);
      const adjustment = selections.optionAdjustments?.[key];
      const detail = original;
      if (adjustment?.lineItems != null) {
        const manual = adjustment.lineItems;
        const lineSubtotal = money(manual.reduce((sum, line) => sum + (line.kind === "included" ? 0 : line.quantity * line.unitPrice), 0));
        const manualDetail = optionDetail(money(lineSubtotal + customServicesTotal),
          { ...selections, optionAdjustments: { ...selections.optionAdjustments, [key]: { ...adjustment, price: null } } },
          key, customServicesTotal);
        return [key, { ...manualDetail, includedLines: [],
          partsPrice: money(manual.filter((line) => line.kind === "parts").reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)),
          laborPrice: money(manual.filter((line) => line.kind === "labor").reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)),
          displayLines: manual.map((line) => ({ ...line, total: line.kind === "included" ? 0 : money(line.quantity * line.unitPrice), itemType: line.kind === "parts" ? "PRODUCT" as const : "SERVICE" as const })),
        }];
      }
      return [key, { ...detail, partsPrice: 0, laborPrice: base, includedLines: holidayIncludedLines(key).map((line) => ({ ...line, total: 0, itemType: "SERVICE" as const })), displayLines: holidayOptionLines({
        lines, key, targetSubtotal: money(detail.subtotal - customServicesTotal),
      }) }];
    })
  ) as HolidayPricingResult["optionDetails"];
  const year1Total = componentDetails.buy.total;
  const leaseTotal = componentDetails.lease.total;
  const permanentTotal = componentDetails.permanent.total;
  const reinstallTotal = year1Total;

  return {
    lines,
    billedLengthFt,
    placementCount: measurements.placements.length,
    year1Total,
    reinstallTotal,
    leaseTotal,
    permanentTotal,
    year1MinimumApplied: style?.kind !== "permanent" && minimum > serviceSubtotal,
    permanentMinimumApplied: style?.kind === "permanent" && minimum > serviceSubtotal,
    purchaseTotal: year1Total,
    purchaseSubtotal: money(serviceSubtotal + customServicesTotal),
    leaseSubtotal: leaseTotal,
    marginPct: 0,
    optionDetails: componentDetails,
    calculatedReinstallTotal: calculatedServiceTotal,
    customServicesTotal,
    cancellationFee,
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
    name: "Lifetime warranty",
    description: "For as long as you continue the yearly service, covered lighting materials and service are warranted for life.",
  },
  {
    name: "Annual color changes",
    description: "Choose a different available color pattern each season at no additional material markup.",
  },
] as const;

export const HOLIDAY_PERMANENT_INCLUDED_LINES = [
  {
    name: "Lifetime warranty",
    description: "Covered permanent lighting materials and installation are warranted for life.",
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
  "A complete yearly holiday lighting service with company-provided materials, professional installation, in-season maintenance, takedown, storage, a lifetime warranty, and the option to change available colors each year.";

export const HOLIDAY_LEASE_DETAIL =
  "Leasing lights is less up front cost but can be more costly long-term. This lets you change the colors and design each year to fit your preferences. This includes installation and take-down as well as any bulb replacements during the season.";

export const HOLIDAY_PERMANENT_DETAIL =
  "A one-time permanent holiday lighting installation with materials, professional installation, covered maintenance, and a lifetime warranty. The installed system remains in place year-round.";

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

/**
 * Customer-facing scope lines for an option. Job minimums and flat-price
 * overrides are distributed across category rows so roofline, tree, and bush
 * pricing stays separate without exposing measurements or adjustment rows.
 */
export function holidayOptionLines(params: {
  lines: HolidayPricedLine[]; key: HolidayQuoteOptionKey; targetSubtotal: number;
  partsPrice?: number; laborPrice?: number;
}): HolidayDisplayLine[] {
  if (!params.lines.length) return [];

  const targetSubtotal = money(Math.max(0, params.targetSubtotal));
  const lineSourceTotal = (line: HolidayPricedLine) => money(Math.max(0,
    params.key === "lease"
      ? line.leaseTotal
      : params.key === "labor"
        ? line.laborTotal
        : line.purchaseTotal
  ));
  const groupOrder: HolidayPricedLine["kind"][] = ["roofline", "tree", "bush", "lift"];
  const groups = groupOrder.flatMap((kind) => {
    const lines = params.lines.filter((line) => line.kind === kind);
    if (!lines.length) return [];
    const styles = [...new Set(lines.map((line) => line.lightStyleLabel?.trim()).filter(Boolean))];
    const colors = [...new Set(lines.map((line) => line.colorPattern?.trim()).filter(Boolean))];
    const description = [...styles, ...colors].join(" · ");
    return [{
      kind,
      name:
        kind === "roofline"
          ? "Roofline lighting"
          : kind === "tree"
            ? "Tree lighting"
            : kind === "bush"
              ? "Bush lighting"
              : "Lift service",
      description,
      sourceTotal: money(lines.reduce((sum, line) => sum + lineSourceTotal(line), 0)),
    }];
  });
  const sourceTotals = groups.map((group) => group.sourceTotal);
  const sourceSubtotal = money(sourceTotals.reduce((sum, total) => sum + total, 0));
  let remaining = targetSubtotal;

  return groups.map((group, index) => {
    const isLast = index === groups.length - 1;
    const requestedAllocation = isLast
      ? remaining
      : sourceSubtotal > 0
        ? money(targetSubtotal * sourceTotals[index]! / sourceSubtotal)
        : money(targetSubtotal / groups.length);
    const allocated = money(Math.min(remaining, Math.max(0, requestedAllocation)));
    remaining = money(Math.max(0, remaining - allocated));
    return {
      id: group.kind,
      name: group.name,
      description: group.description,
      quantity: 1,
      unitPrice: allocated,
      kind: "service",
      total: allocated,
      itemType: "SERVICE",
    };
  });
}

export function holidayIncludedLines(key: HolidayQuoteOptionKey) {
  return key === "permanent" ? [
    ...HOLIDAY_PERMANENT_INCLUDED_LINES,
    { name: "Maintenance", description: "Covered system maintenance is included under the lifetime warranty." },
  ] : HOLIDAY_INCLUDED_LINES;
}
