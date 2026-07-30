import {
  gableLengthsFromBase,
  pitchDegFromImageLine,
  riseFromHorizontal,
  trueLengthFromHorizontal,
} from "@/lib/holiday-lighting/roof-pitch";
import type {
  HolidayMeasurementSegment,
  HolidayMeasurements,
  StreetViewNormPoint,
  StreetViewRoofTrace,
} from "@/lib/holiday-lighting/types";

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function midpoint(a: StreetViewNormPoint, b: StreetViewNormPoint): StreetViewNormPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Apply a street-view roof trace onto its linked satellite segment (pitch → true length).
 * Gable points are [leftEave, rightEave, peak]. Single slope is [endA, endB] along the roof edge.
 */
export function applyStreetTraceToSegment(
  segment: HolidayMeasurementSegment,
  trace: StreetViewRoofTrace
): HolidayMeasurementSegment {
  const horizontal = segment.horizontalLengthFt ?? segment.lengthFt ?? 0;
  const pts = trace.points;
  if (pts.length >= 3) {
    const left = pts[0]!;
    const right = pts[1]!;
    const peak = pts[2]!;
    const leftPitch = pitchDegFromImageLine(left, peak);
    const rightPitch = pitchDegFromImageLine(right, peak);
    const gable = gableLengthsFromBase(horizontal, leftPitch, rightPitch);
    return {
      ...segment,
      flat: false,
      horizontalLengthFt: horizontal,
      pitchDeg: leftPitch,
      pitchDegRight: rightPitch,
      riseFt: gable.riseFt,
      lengthFt: gable.leftLengthFt,
      lengthFtRight: gable.rightLengthFt,
    };
  }
  if (pts.length >= 2) {
    const pitch = pitchDegFromImageLine(pts[0]!, pts[1]!);
    return {
      ...segment,
      flat: false,
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

/** Preview pitch-corrected lengths without persisting. */
export function previewSegmentFromPoints(
  segment: HolidayMeasurementSegment,
  points: StreetViewNormPoint[]
): HolidayMeasurementSegment {
  return applyStreetTraceToSegment(segment, {
    id: "preview",
    satelliteSegmentId: segment.id,
    points,
  });
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
  if (segment.flat) {
    return Math.max(0, Number(segment.horizontalLengthFt ?? segment.lengthFt) || 0);
  }
  const left = Math.max(0, Number(segment.lengthFt) || 0);
  const right = Math.max(0, Number(segment.lengthFtRight) || 0);
  if (segment.lengthFtRight != null && segment.pitchDegRight != null) {
    return Math.round((left + right) * 10) / 10;
  }
  return left;
}

/** Pitch match complete: street-view approved, or marked flat. */
export function segmentPitchResolved(segment: HolidayMeasurementSegment): boolean {
  if (segment.flat) return true;
  return segment.pitchDeg != null;
}

/** Mark a segment as flat (plan length = billed length). Clears any street-view match. */
export function markSegmentFlat(
  measurements: HolidayMeasurements,
  segmentId: string
): HolidayMeasurements {
  return {
    ...measurements,
    streetTraces: (measurements.streetTraces ?? []).filter(
      (t) => t.satelliteSegmentId !== segmentId
    ),
    segments: measurements.segments.map((seg) => {
      if (seg.id !== segmentId) return seg;
      const horizontal = seg.horizontalLengthFt ?? seg.lengthFt;
      return {
        ...seg,
        flat: true,
        horizontalLengthFt: horizontal,
        lengthFt: horizontal,
        pitchDeg: 0,
        pitchDegRight: undefined,
        lengthFtRight: undefined,
        riseFt: 0,
      };
    }),
  };
}

/** Clear flat mark so the segment needs pitch matching again. */
export function clearSegmentFlat(
  measurements: HolidayMeasurements,
  segmentId: string
): HolidayMeasurements {
  return {
    ...measurements,
    segments: measurements.segments.map((seg) => {
      if (seg.id !== segmentId) return seg;
      const horizontal = seg.horizontalLengthFt ?? seg.lengthFt;
      return {
        ...seg,
        flat: false,
        horizontalLengthFt: horizontal,
        lengthFt: horizontal,
        pitchDeg: undefined,
        pitchDegRight: undefined,
        lengthFtRight: undefined,
        riseFt: undefined,
      };
    }),
  };
}
