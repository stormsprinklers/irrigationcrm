import {
  gableLengthsFromBase,
  pitchDegFromImageLine,
  riseFromHorizontal,
  trueLengthFromHorizontal,
} from "@/lib/holiday-lighting/roof-pitch";
import type {
  HolidayMeasurementSegment,
  HolidayMeasurements,
  StreetViewRoofTrace,
} from "@/lib/holiday-lighting/types";

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Apply a street-view roof trace onto its linked satellite segment (pitch → true length). */
export function applyStreetTraceToSegment(
  segment: HolidayMeasurementSegment,
  trace: StreetViewRoofTrace
): HolidayMeasurementSegment {
  const horizontal =
    segment.horizontalLengthFt ??
    segment.lengthFt ??
    0;
  const pts = trace.points;
  if (pts.length >= 3) {
    const left = pitchDegFromImageLine(pts[0]!, pts[1]!);
    const right = pitchDegFromImageLine(pts[1]!, pts[2]!);
    const gable = gableLengthsFromBase(horizontal, left, right);
    return {
      ...segment,
      horizontalLengthFt: horizontal,
      pitchDeg: left,
      pitchDegRight: right,
      riseFt: gable.riseFt,
      lengthFt: gable.leftLengthFt,
      lengthFtRight: gable.rightLengthFt,
    };
  }
  if (pts.length >= 2) {
    const pitch = pitchDegFromImageLine(pts[0]!, pts[1]!);
    return {
      ...segment,
      horizontalLengthFt: horizontal,
      pitchDeg: pitch,
      pitchDegRight: undefined,
      lengthFtRight: undefined,
      riseFt: riseFromHorizontal(horizontal, pitch),
      lengthFt: trueLengthFromHorizontal(horizontal, pitch),
    };
  }
  return segment;
}

export function upsertStreetTrace(
  measurements: HolidayMeasurements,
  satelliteSegmentId: string,
  points: StreetViewRoofTrace["points"]
): HolidayMeasurements {
  const existing = (measurements.streetTraces ?? []).filter(
    (t) => t.satelliteSegmentId !== satelliteSegmentId
  );
  const prev = (measurements.streetTraces ?? []).find(
    (t) => t.satelliteSegmentId === satelliteSegmentId
  );
  const trace: StreetViewRoofTrace = {
    id: prev?.id ?? newId(),
    satelliteSegmentId,
    points,
  };
  const segments = measurements.segments.map((seg) =>
    seg.id === satelliteSegmentId ? applyStreetTraceToSegment(seg, trace) : seg
  );
  return {
    ...measurements,
    segments,
    streetTraces: [...existing, trace],
  };
}

/** Recompute pitch-corrected lengths after satellite horizontal length changes. */
export function refreshPitchCorrections(
  measurements: HolidayMeasurements
): HolidayMeasurements {
  const traces = measurements.streetTraces ?? [];
  if (!traces.length) return measurements;
  return {
    ...measurements,
    segments: measurements.segments.map((seg) => {
      const trace = traces.find((t) => t.satelliteSegmentId === seg.id);
      if (!trace) return seg;
      return applyStreetTraceToSegment(seg, trace);
    }),
  };
}

/** Length used for pricing: single slope or sum of gable legs. */
export function billedSegmentLengthFt(segment: HolidayMeasurementSegment): number {
  const left = Math.max(0, Number(segment.lengthFt) || 0);
  const right = Math.max(0, Number(segment.lengthFtRight) || 0);
  if (segment.lengthFtRight != null && segment.pitchDegRight != null) {
    return Math.round((left + right) * 10) / 10;
  }
  return left;
}
