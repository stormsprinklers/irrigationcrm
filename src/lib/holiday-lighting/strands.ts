import { billedSegmentLengthFt, segmentPitchResolved } from "@/lib/holiday-lighting/pitch-match";
import type {
  HolidayMeasurementSegment,
  HolidayMeasurements,
  HolidayStrand,
  HolidayTreeSize,
} from "@/lib/holiday-lighting/types";

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `strand-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Visual circle radius (meters) for Tree/Shrub placement by size. */
export function treeShrubRadiusMeters(size: HolidayTreeSize): number {
  switch (size) {
    case "small":
      return 1.8; // ~6 ft
    case "medium":
      return 3.0; // ~10 ft
    case "large":
      return 4.3; // ~14 ft
    case "xl":
      return 5.5; // ~18 ft
    default:
      return 3.0;
  }
}

export function treeShrubSizeLabel(size: HolidayTreeSize): string {
  switch (size) {
    case "small":
      return "Small";
    case "medium":
      return "Medium";
    case "large":
      return "Large";
    case "xl":
      return "Extra large";
    default:
      return size;
  }
}

export function strandOfSegment(
  measurements: HolidayMeasurements,
  segmentId: string
): HolidayStrand | undefined {
  return (measurements.strands ?? []).find((s) => s.segmentIds.includes(segmentId));
}

export function segmentIdsInAnyStrand(measurements: HolidayMeasurements): Set<string> {
  const ids = new Set<string>();
  for (const strand of measurements.strands ?? []) {
    for (const id of strand.segmentIds) ids.add(id);
  }
  return ids;
}

export function billedStrandLengthFt(
  strand: HolidayStrand,
  segments: HolidayMeasurementSegment[]
): number {
  let total = 0;
  for (const id of strand.segmentIds) {
    const seg = segments.find((s) => s.id === id);
    if (seg) total += billedSegmentLengthFt(seg);
  }
  return Math.round(total * 10) / 10;
}

/** Drop deleted / unresolved segment ids from strands; remove empty strands. */
export function pruneStrands(
  measurements: HolidayMeasurements
): HolidayMeasurements {
  const byId = new Map(measurements.segments.map((s) => [s.id, s]));
  const strands = (measurements.strands ?? [])
    .map((s) => ({
      ...s,
      segmentIds: s.segmentIds.filter((id) => {
        const seg = byId.get(id);
        return !!seg && segmentPitchResolved(seg);
      }),
    }))
    .filter((s) => s.segmentIds.length > 0);
  return { ...measurements, strands };
}

export function combineSegmentsIntoStrand(
  measurements: HolidayMeasurements,
  segmentIds: string[],
  label?: string
): HolidayMeasurements {
  const unique = [...new Set(segmentIds)];
  if (unique.length < 1) return measurements;

  const resolved = unique.filter((id) => {
    const seg = measurements.segments.find((s) => s.id === id);
    return seg && segmentPitchResolved(seg);
  });
  if (resolved.length < 1) return measurements;

  // Remove these segments from existing strands first.
  let strands = (measurements.strands ?? []).map((s) => ({
    ...s,
    segmentIds: s.segmentIds.filter((id) => !resolved.includes(id)),
  }));
  strands = strands.filter((s) => s.segmentIds.length > 0);

  const n = strands.length + 1;
  const first = measurements.segments.find((s) => s.id === resolved[0]);
  const strand: HolidayStrand = {
    id: newId(),
    label: label?.trim() || `Strand ${n}`,
    segmentIds: resolved,
    lightStyleKey: first?.lightStyleKey,
  };

  return { ...measurements, strands: [...strands, strand] };
}

export function renameStrand(
  measurements: HolidayMeasurements,
  strandId: string,
  label: string
): HolidayMeasurements {
  return {
    ...measurements,
    strands: (measurements.strands ?? []).map((s) =>
      s.id === strandId ? { ...s, label: label.trim() || s.label } : s
    ),
  };
}

export function dissolveStrand(
  measurements: HolidayMeasurements,
  strandId: string
): HolidayMeasurements {
  return {
    ...measurements,
    strands: (measurements.strands ?? []).filter((s) => s.id !== strandId),
  };
}

export function removeSegmentFromStrand(
  measurements: HolidayMeasurements,
  strandId: string,
  segmentId: string
): HolidayMeasurements {
  const strands = (measurements.strands ?? [])
    .map((s) =>
      s.id === strandId
        ? { ...s, segmentIds: s.segmentIds.filter((id) => id !== segmentId) }
        : s
    )
    .filter((s) => s.segmentIds.length > 0);
  return { ...measurements, strands };
}

export function addSegmentToStrand(
  measurements: HolidayMeasurements,
  strandId: string,
  segmentId: string
): HolidayMeasurements {
  const seg = measurements.segments.find((s) => s.id === segmentId);
  if (!seg || !segmentPitchResolved(seg)) return measurements;

  // Ensure segment isn't in another strand.
  let strands = (measurements.strands ?? []).map((s) => ({
    ...s,
    segmentIds: s.segmentIds.filter((id) => id !== segmentId),
  }));
  strands = strands
    .map((s) =>
      s.id === strandId && !s.segmentIds.includes(segmentId)
        ? { ...s, segmentIds: [...s.segmentIds, segmentId] }
        : s
    )
    .filter((s) => s.segmentIds.length > 0);

  return { ...measurements, strands };
}
