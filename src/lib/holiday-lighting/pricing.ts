import type {
  HolidayLightingCatalog,
  HolidayMeasurementSegment,
  HolidayMeasurements,
  HolidayQuoteSelections,
} from "./types";
import { billedSegmentLengthFt } from "./pitch-match";
import { billedStrandLengthFt, segmentIdsInAnyStrand } from "./strands";

export type PriceLookup = Map<string, { id: string; name: string; unitPrice: number }>;

export type HolidayPricedLine = {
  key: string;
  name: string;
  description: string;
  /** Staff-only breakdown. */
  staffDetail: string;
  purchaseTotal: number;
  leaseTotal: number;
  priceBookItemId?: string | null;
};

export type HolidayPricingResult = {
  lines: HolidayPricedLine[];
  purchaseSubtotal: number;
  leaseSubtotal: number;
  marginPct: number;
  purchaseTotal: number;
  leaseTotal: number;
};

function money(n: number) {
  return Math.round(n * 100) / 100;
}

function lookup(prices: PriceLookup, sku: string | undefined) {
  if (!sku) return null;
  return prices.get(sku) ?? null;
}

function priceRooflineLength(params: {
  catalog: HolidayLightingCatalog;
  selections: HolidayQuoteSelections;
  prices: PriceLookup;
  styleKey: string;
  lengthFt: number;
  key: string;
  name: string;
  description: string;
  staffDetail: string;
}): HolidayPricedLine | null {
  const { catalog, selections, prices, styleKey, lengthFt, key, name, description, staffDetail } =
    params;
  if (lengthFt <= 0) return null;
  const style =
    catalog.lightStyles.find((s) => s.key === styleKey) ?? catalog.lightStyles[0];
  if (!style) return null;

  const parts = lookup(prices, style.partsSku);
  const install = lookup(prices, style.installSku);
  const leaseFt = lookup(prices, style.leaseSku);
  const partsRate = parts?.unitPrice ?? 5;
  const installRate = install?.unitPrice ?? 7;
  const leaseRate = leaseFt?.unitPrice ?? partsRate + installRate * 0.65;
  const purchase = lengthFt * (partsRate + installRate);
  const lease = lengthFt * leaseRate;

  return {
    key,
    name: `${style.label} ${name}`,
    description,
    staffDetail: `${staffDetail} × ($${partsRate.toFixed(2)} parts + $${installRate.toFixed(2)} install)`,
    purchaseTotal: money(purchase),
    leaseTotal: money(lease),
    priceBookItemId: parts?.id ?? install?.id ?? null,
  };
}

function segmentPitchNote(segment: HolidayMeasurementSegment, lengthFt: number): string {
  if (segment.flat) return " · flat (plan length)";
  if (segment.pitchDeg == null) return "";
  if (segment.pitchDegRight != null) {
    return ` · ${segment.pitchDeg}°/${segment.pitchDegRight}° from plan ${Number(
      segment.horizontalLengthFt ?? lengthFt
    ).toFixed(1)} ft`;
  }
  return ` · ${segment.pitchDeg}° from plan ${Number(
    segment.horizontalLengthFt ?? lengthFt
  ).toFixed(1)} ft`;
}

export function computeHolidayQuotePricing(params: {
  catalog: HolidayLightingCatalog;
  measurements: HolidayMeasurements;
  selections: HolidayQuoteSelections;
  prices: PriceLookup;
}): HolidayPricingResult {
  const { catalog, measurements, selections, prices } = params;
  const lines: HolidayPricedLine[] = [];
  const groupedIds = segmentIdsInAnyStrand(measurements);

  for (const strand of measurements.strands ?? []) {
    const members = strand.segmentIds
      .map((id) => measurements.segments.find((s) => s.id === id))
      .filter((s): s is HolidayMeasurementSegment => !!s);
    if (!members.length) continue;

    const lengthFt = billedStrandLengthFt(strand, measurements.segments);
    const styleKey =
      strand.lightStyleKey ??
      members[0]?.lightStyleKey ??
      selections.defaultLightStyleKey;
    const memberDetail = members
      .map((m) => `${m.label} ${billedSegmentLengthFt(m).toFixed(1)} ft`)
      .join("; ");

    const line = priceRooflineLength({
      catalog,
      selections,
      prices,
      styleKey,
      lengthFt,
      key: strand.id,
      name: `strand — ${strand.label}`,
      description: `Approx. ${Math.round(lengthFt)} linear ft (${members.length} segments)`,
      staffDetail: `${lengthFt.toFixed(1)} ft strand [${memberDetail}]`,
    });
    if (line) lines.push(line);
  }

  for (const segment of measurements.segments) {
    if (groupedIds.has(segment.id)) continue;

    const styleKey = segment.lightStyleKey ?? selections.defaultLightStyleKey;
    const lengthFt = billedSegmentLengthFt(segment);

    if (segment.kind === "peak") {
      const style =
        catalog.lightStyles.find((s) => s.key === styleKey) ?? catalog.lightStyles[0];
      if (!style) continue;
      const peak = lookup(prices, catalog.peakSku);
      const peakLease = lookup(prices, catalog.peakLeaseSku);
      const purchase = peak?.unitPrice ?? 175;
      const lease = peakLease?.unitPrice ?? purchase * 0.7;
      lines.push({
        key: segment.id,
        name: `${style.label} peak / dormer — ${segment.label}`,
        description: `Accent lighting on ${segment.label}`,
        staffDetail: `Peak flat rate`,
        purchaseTotal: money(purchase),
        leaseTotal: money(lease),
        priceBookItemId: peak?.id ?? null,
      });
      continue;
    }

    if (lengthFt <= 0) continue;
    const line = priceRooflineLength({
      catalog,
      selections,
      prices,
      styleKey,
      lengthFt,
      key: segment.id,
      name: `${segment.kind} — ${segment.label}`,
      description: `Approx. ${Math.round(lengthFt)} linear ft`,
      staffDetail: `${lengthFt.toFixed(1)} ft${segmentPitchNote(segment, lengthFt)}`,
    });
    if (line) lines.push(line);
  }

  for (const placement of measurements.placements) {
    const catalogItem =
      catalog.placements.find(
        (p) => p.kind === placement.kind && p.size === placement.size
      ) ??
      catalog.placements.find((p) => p.kind === placement.kind) ??
      null;
    if (!catalogItem) continue;
    const item = lookup(prices, catalogItem.sku);
    const leaseItem = lookup(prices, catalogItem.leaseSku);
    const purchase = item?.unitPrice ?? 0;
    const lease = leaseItem?.unitPrice ?? purchase * 0.7;
    lines.push({
      key: placement.id,
      name: `${catalogItem.label} — ${placement.label}`,
      description: placement.label,
      staffDetail: `Each @ $${purchase.toFixed(2)}`,
      purchaseTotal: money(purchase),
      leaseTotal: money(lease),
      priceBookItemId: item?.id ?? null,
    });
  }

  const purchaseSubtotal = money(lines.reduce((s, l) => s + l.purchaseTotal, 0));
  const leaseSubtotal = money(lines.reduce((s, l) => s + l.leaseTotal, 0));
  const marginPct = selections.marginPct;
  const factor = 1 + marginPct / 100;

  return {
    lines,
    purchaseSubtotal,
    leaseSubtotal,
    marginPct,
    purchaseTotal: money(purchaseSubtotal * factor),
    leaseTotal: money(leaseSubtotal * factor),
  };
}

/** Apply margin proportionally so customer line totals sum to option total. */
export function applyMarginToLines(
  lines: HolidayPricedLine[],
  field: "purchaseTotal" | "leaseTotal",
  marginPct: number
): Array<HolidayPricedLine & { customerTotal: number }> {
  const factor = 1 + marginPct / 100;
  return lines.map((line) => ({
    ...line,
    customerTotal: money(line[field] * factor),
  }));
}
