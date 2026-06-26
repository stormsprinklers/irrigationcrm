/**
 * Effective rainfall after runoff, evaporation, and deep percolation losses.
 * Based on Texas A&M ET calculator tiered method.
 */
export function effectiveRainSimple(totalRainInches: number): number {
  if (totalRainInches <= 0.1) return 0;
  if (totalRainInches <= 1.0) return totalRainInches - 0.1;
  if (totalRainInches <= 2.0) return 0.9 + (totalRainInches - 1.0) * (2 / 3);
  return 0.9 + (1.0 * 2) / 3;
}

export function effectiveRainForLandscape(
  totalRainInches: number,
  landscapeETInches: number
): number {
  return Math.min(effectiveRainSimple(totalRainInches), landscapeETInches);
}
