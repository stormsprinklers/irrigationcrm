import type { GrassSeason } from "../types";
import type { ShadeLevel, SlopeLevel, VegetationType } from "../../types";

export const SPECIES_FACTOR_DEFAULTS = {
  xeric: 0.2,
  lowWaterShrubs: 0.3,
  moderateShrubs: 0.5,
  highWaterPlants: 0.8,
  warmSeasonTurf: 0.6,
  coolSeasonTurf: 0.8,
  vegetableGarden: 1.0,
} as const;

const SHADE_KMC: Record<ShadeLevel, number> = {
  full_sun: 1.0,
  some_shade: 0.85,
  lots_of_shade: 0.65,
};

const VEGETATION_KS: Record<VegetationType, number> = {
  grass: SPECIES_FACTOR_DEFAULTS.coolSeasonTurf,
  shrubs: SPECIES_FACTOR_DEFAULTS.moderateShrubs,
  trees: SPECIES_FACTOR_DEFAULTS.moderateShrubs,
  flower_bed: SPECIES_FACTOR_DEFAULTS.highWaterPlants,
};

const VEGETATION_KD: Record<VegetationType, number> = {
  grass: 1.0,
  shrubs: 0.8,
  trees: 0.7,
  flower_bed: 0.9,
};

export function speciesFactor(
  vegetationType: VegetationType,
  grassSeason: GrassSeason = "COOL"
): number {
  if (vegetationType === "grass") {
    return grassSeason === "WARM"
      ? SPECIES_FACTOR_DEFAULTS.warmSeasonTurf
      : SPECIES_FACTOR_DEFAULTS.coolSeasonTurf;
  }
  return VEGETATION_KS[vegetationType];
}

export function densityFactor(vegetationType: VegetationType): number {
  return VEGETATION_KD[vegetationType];
}

export function microclimateFactor(
  shadeLevel: ShadeLevel,
  slopeLevel: SlopeLevel = "flat"
): number {
  let kmc = SHADE_KMC[shadeLevel];
  if (slopeLevel === "steep") kmc += 0.05;
  else if (slopeLevel === "moderate") kmc += 0.02;
  return Math.max(0.5, Math.min(1.4, kmc));
}

export function landscapeCoefficient(
  vegetationType: VegetationType,
  shadeLevel: ShadeLevel,
  slopeLevel: SlopeLevel,
  grassSeason: GrassSeason = "COOL"
): { Ks: number; Kd: number; Kmc: number; KL: number } {
  const Ks = speciesFactor(vegetationType, grassSeason);
  const Kd = densityFactor(vegetationType);
  const Kmc = microclimateFactor(shadeLevel, slopeLevel);
  return { Ks, Kd, Kmc, KL: Ks * Kd * Kmc };
}

export function daysPerWeekForVegetation(
  vegetationType: VegetationType,
  shadeLevel: ShadeLevel,
  droughtMode: boolean
): number {
  if (droughtMode) return 2;

  const base: Record<VegetationType, number> = {
    grass: 3,
    shrubs: 2,
    trees: 1,
    flower_bed: 2,
  };

  const shadeFactor =
    shadeLevel === "lots_of_shade" ? 0.67 : shadeLevel === "some_shade" ? 0.85 : 1.0;

  return Math.max(1, Math.min(7, Math.round(base[vegetationType] * shadeFactor)));
}

export const DROUGHT_DAYS: import("../types").DayOfWeekCode[] = ["TUE", "FRI"];

export const DEFAULT_DAYS_BY_VEGETATION: Record<
  VegetationType,
  import("../types").DayOfWeekCode[]
> = {
  grass: ["MON", "WED", "FRI"],
  shrubs: ["TUE", "FRI"],
  trees: ["WED"],
  flower_bed: ["TUE", "SAT"],
};
