/** Roof pitch helpers: satellite horizontal run + street-view angle → true length. */

export type NormPoint = { x: number; y: number };

function clampPitchDeg(deg: number) {
  if (!Number.isFinite(deg)) return 0;
  return Math.min(80, Math.max(0, deg));
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

/**
 * Pitch of a line drawn on a photo (normalized coords, y grows downward).
 * Returns degrees from horizontal, 0–90.
 */
export function pitchDegFromImageLine(a: NormPoint, b: NormPoint): number {
  const dx = b.x - a.x;
  const dy = -(b.y - a.y); // flip so up is positive
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return 0;
  const deg = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
  return Math.round(clampPitchDeg(deg) * 10) / 10;
}

/** True roof-edge length from plan (horizontal) run and pitch from horizontal. */
export function trueLengthFromHorizontal(horizontalFt: number, pitchDeg: number): number {
  const run = Math.max(0, horizontalFt);
  const rad = toRad(clampPitchDeg(pitchDeg));
  const cos = Math.cos(rad);
  if (cos < 0.05) return run;
  return Math.round((run / cos) * 10) / 10;
}

/** Vertical rise of the roof plane over that horizontal run. */
export function riseFromHorizontal(horizontalFt: number, pitchDeg: number): number {
  const run = Math.max(0, horizontalFt);
  const rad = toRad(clampPitchDeg(pitchDeg));
  return Math.round(run * Math.tan(rad) * 10) / 10;
}

/**
 * Gable (two slopes) from horizontal eave-to-eave base and left/right pitches.
 * Rise is shared; each side’s run splits the base by tan ratios.
 */
export function gableLengthsFromBase(
  baseFt: number,
  leftPitchDeg: number,
  rightPitchDeg: number
): {
  riseFt: number;
  leftRunFt: number;
  rightRunFt: number;
  leftLengthFt: number;
  rightLengthFt: number;
  totalLengthFt: number;
} {
  const base = Math.max(0, baseFt);
  const t1 = Math.tan(toRad(clampPitchDeg(leftPitchDeg)));
  const t2 = Math.tan(toRad(clampPitchDeg(rightPitchDeg)));
  if (t1 < 1e-6 && t2 < 1e-6) {
    return {
      riseFt: 0,
      leftRunFt: base / 2,
      rightRunFt: base / 2,
      leftLengthFt: base / 2,
      rightLengthFt: base / 2,
      totalLengthFt: base,
    };
  }
  // rise / tan(θ) = run; leftRun + rightRun = base
  const inv1 = t1 < 1e-6 ? 1e6 : 1 / t1;
  const inv2 = t2 < 1e-6 ? 1e6 : 1 / t2;
  const riseFt = Math.round((base / (inv1 + inv2)) * 10) / 10;
  const leftRunFt = Math.round(riseFt * inv1 * 10) / 10;
  const rightRunFt = Math.round((base - leftRunFt) * 10) / 10;
  const leftLengthFt = trueLengthFromHorizontal(leftRunFt, leftPitchDeg);
  const rightLengthFt = trueLengthFromHorizontal(rightRunFt, rightPitchDeg);
  return {
    riseFt,
    leftRunFt,
    rightRunFt,
    leftLengthFt,
    rightLengthFt,
    totalLengthFt: Math.round((leftLengthFt + rightLengthFt) * 10) / 10,
  };
}
