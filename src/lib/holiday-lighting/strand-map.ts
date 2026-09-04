import { billedSegmentLengthFt } from "@/lib/holiday-lighting/pitch-match";
import type { HolidayPricedLine } from "@/lib/holiday-lighting/pricing";
import { billedStrandLengthFt, segmentIdsInAnyStrand } from "@/lib/holiday-lighting/strands";
import type {
  HolidayLatLng,
  HolidayLightingCatalog,
  HolidayMeasurementSegment,
  HolidayMeasurements,
  HolidayQuoteSelections,
} from "@/lib/holiday-lighting/types";

/** Stable palette so the same strand index keeps the same color across quoter / estimate / visit. */
export const HOLIDAY_STRAND_COLORS = [
  "#C45C26",
  "#2F6B4F",
  "#3B82F6",
  "#7C3AED",
  "#D4A017",
  "#E11D48",
  "#0D9488",
  "#EA580C",
  "#64748B",
  "#BE185D",
] as const;

export type HolidayStrandMapFeature = {
  id: string;
  label: string;
  color: string;
  /** Combined paths for each member segment (for map drawing). */
  paths: HolidayLatLng[][];
  /** Pitch-corrected billed length before margin. */
  lengthFt: number;
  /** Billed length × (1 + marginPct/100) — what installers order/hang. */
  lengthFtWithMargin: number;
  lightStyleKey: string;
  lightStyleLabel: string;
  purchaseTotal: number;
  leaseTotal: number;
  kind: "strand" | "segment" | "placement";
  /** Placement circle center + radius meters when kind === placement. */
  placement?: { latLng: HolidayLatLng; radiusMeters: number };
};

export type HolidayStrandMap = {
  version: 1;
  marginPct: number;
  address?: string;
  center: HolidayLatLng | null;
  features: HolidayStrandMapFeature[];
};

export function holidayStrandColorAt(index: number): string {
  return HOLIDAY_STRAND_COLORS[index % HOLIDAY_STRAND_COLORS.length]!;
}

function money(n: number) {
  return Math.round(n * 100) / 100;
}

function lengthWithMargin(lengthFt: number, marginPct: number): number {
  const factor = 1 + marginPct / 100;
  return Math.round(lengthFt * factor * 10) / 10;
}

function styleLabel(catalog: HolidayLightingCatalog, key: string): string {
  return catalog.lightStyles.find((s) => s.key === key)?.label ?? key;
}

function lineTotals(
  lines: HolidayPricedLine[],
  key: string,
  marginPct: number
): { purchaseTotal: number; leaseTotal: number } {
  const line = lines.find((l) => l.key === key);
  const factor = 1 + marginPct / 100;
  return {
    purchaseTotal: money((line?.purchaseTotal ?? 0) * factor),
    leaseTotal: money((line?.leaseTotal ?? 0) * factor),
  };
}

function centroid(points: HolidayLatLng[]): HolidayLatLng | null {
  if (!points.length) return null;
  const sum = points.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 }
  );
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

/**
 * Build a portable strand map for estimates / portal / visits from quote measurements + pricing.
 */
export function buildHolidayStrandMap(params: {
  measurements: HolidayMeasurements;
  selections: HolidayQuoteSelections;
  catalog: HolidayLightingCatalog;
  pricedLines: HolidayPricedLine[];
  address?: string;
}): HolidayStrandMap {
  const { measurements, selections, catalog, pricedLines, address } = params;
  const marginPct = selections.marginPct ?? 0;
  const features: HolidayStrandMapFeature[] = [];
  const groupedIds = segmentIdsInAnyStrand(measurements);
  const allPoints: HolidayLatLng[] = [];

  let colorIndex = 0;

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
    const paths = members.map((m) => m.path).filter((p) => p.length > 0);
    for (const path of paths) allPoints.push(...path);

    const totals = lineTotals(pricedLines, strand.id, marginPct);
    features.push({
      id: strand.id,
      label: strand.label,
      color: holidayStrandColorAt(colorIndex++),
      paths,
      lengthFt,
      lengthFtWithMargin: lengthWithMargin(lengthFt, marginPct),
      lightStyleKey: styleKey,
      lightStyleLabel: styleLabel(catalog, styleKey),
      purchaseTotal: totals.purchaseTotal,
      leaseTotal: totals.leaseTotal,
      kind: "strand",
    });
  }

  for (const segment of measurements.segments) {
    if (groupedIds.has(segment.id)) continue;
    if (!segment.path.length) continue;
    allPoints.push(...segment.path);
    const lengthFt = billedSegmentLengthFt(segment);
    const styleKey = segment.lightStyleKey ?? selections.defaultLightStyleKey;
    const totals = lineTotals(pricedLines, segment.id, marginPct);
    features.push({
      id: segment.id,
      label: segment.label,
      color: holidayStrandColorAt(colorIndex++),
      paths: [segment.path],
      lengthFt,
      lengthFtWithMargin: lengthWithMargin(lengthFt, marginPct),
      lightStyleKey: styleKey,
      lightStyleLabel: styleLabel(catalog, styleKey),
      purchaseTotal: totals.purchaseTotal,
      leaseTotal: totals.leaseTotal,
      kind: "segment",
    });
  }

  for (const placement of measurements.placements) {
    allPoints.push(placement.latLng);
    const catalogItem =
      catalog.placements.find(
        (p) => p.kind === placement.kind && p.size === placement.size
      ) ??
      catalog.placements.find((p) => p.kind === placement.kind) ??
      null;
    const totals = lineTotals(pricedLines, placement.id, marginPct);
    const radiusMeters =
      placement.size === "small"
        ? 1.8
        : placement.size === "medium"
          ? 3.0
          : placement.size === "large"
            ? 4.3
            : 5.5;
    features.push({
      id: placement.id,
      label: placement.label,
      color: holidayStrandColorAt(colorIndex++),
      paths: [],
      lengthFt: 0,
      lengthFtWithMargin: 0,
      lightStyleKey: selections.defaultLightStyleKey,
      lightStyleLabel: catalogItem?.label ?? "Tree/shrub",
      purchaseTotal: totals.purchaseTotal,
      leaseTotal: totals.leaseTotal,
      kind: "placement",
      placement: { latLng: placement.latLng, radiusMeters },
    });
  }

  return {
    version: 1,
    marginPct,
    address,
    center: centroid(allPoints),
    features,
  };
}

export function parseHolidayStrandMap(raw: unknown): HolidayStrandMap | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Partial<HolidayStrandMap>;
  if (obj.version !== 1 || !Array.isArray(obj.features)) return null;
  return {
    version: 1,
    marginPct: typeof obj.marginPct === "number" ? obj.marginPct : 0,
    address: typeof obj.address === "string" ? obj.address : undefined,
    center:
      obj.center &&
      typeof obj.center.lat === "number" &&
      typeof obj.center.lng === "number"
        ? { lat: obj.center.lat, lng: obj.center.lng }
        : null,
    features: obj.features.filter(
      (f): f is HolidayStrandMapFeature =>
        !!f &&
        typeof f === "object" &&
        typeof f.id === "string" &&
        typeof f.label === "string" &&
        typeof f.color === "string" &&
        Array.isArray(f.paths)
    ),
  };
}

export function holidayStrandMapFromMetadata(
  meta: Record<string, unknown> | null | undefined
): HolidayStrandMap | null {
  if (!meta || meta.source !== "holiday-lighting-quote") return null;
  return parseHolidayStrandMap(meta.strandMap);
}
