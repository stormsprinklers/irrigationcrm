import type {
  IrrigationType,
  ShadeLevel,
  SlopeLevel,
  SoilType,
  VegetationType,
} from "./types";
import {
  getManufacturerSpec,
  TARGET_DEPTH_INCHES,
} from "./manufacturer-data";

const REFERENCE_TEMP_F = 70;

export function temperatureFactor(temperatureF: number): number {
  const delta = temperatureF - REFERENCE_TEMP_F;
  const factor = 1 + delta * 0.02;
  return Math.max(0.5, Math.min(2.0, factor));
}

function applyTemperatureFactor(baseRuntimeMinutes: number, temperatureF: number): number {
  return Math.max(1, Math.round(baseRuntimeMinutes * temperatureFactor(temperatureF)));
}

/**
 * Utah irrigation scheduling aligned with Storm Sprinklers guidance:
 * https://www.stormsprinklers.com/guides/utah-lawn-sprinkler-scheduling-guide
 *
 * - Spray: ~15–30 min, 3×/week
 * - Rotary: ~45–60 min, 3×/week
 * - Drip: ~30 min, 3×/week
 * - Water 7 PM–7 AM; finish near sunrise; avoid 10 AM–6 PM
 * - Cycle-soak on clay and slopes (Utah DNR / Storm Sprinklers)
 */

/** Default first zone start — early morning, finish near sunrise */
export const DEFAULT_FIRST_START_MINUTES = 5 * 60; // 5:00 AM

/** Utah cities typically prohibit midday watering */
export const UTAH_WATERING_WINDOW = {
  bestStartEarliest: 5 * 60, // 5:00 AM
  bestFinishBy: 9 * 60 + 30, // ~9:30 AM (near sunrise in summer)
  avoidStart: 9 * 60, // 9:00 AM
  avoidEnd: 18 * 60, // 6:00 PM
};

/** Peak-season baseline days per week by vegetation (Utah residential) */
const BASE_DAYS_PER_WEEK: Record<VegetationType, number> = {
  grass: 3,
  shrubs: 2,
  trees: 1,
  flower_bed: 2,
};

/** Shade reduces ET — water less often and apply less per event */
const SHADE_DAYS_FACTOR: Record<ShadeLevel, number> = {
  full_sun: 1.0,
  some_shade: 0.85,
  lots_of_shade: 0.67,
};

const SHADE_DEPTH_FACTOR: Record<ShadeLevel, number> = {
  full_sun: 1.0,
  some_shade: 0.85,
  lots_of_shade: 0.65,
};

/** Sand drains fast — water slightly more often; clay uses cycle-soak instead of extra days */
const SOIL_DAYS_FACTOR: Record<SoilType, number> = {
  sand: 1.2,
  loam: 1.0,
  clay: 1.0,
};

const SOIL_DEPTH_FACTOR: Record<SoilType, number> = {
  sand: 1.1,
  loam: 1.0,
  clay: 1.0,
};

/** Slopes need shorter cycles to limit runoff */
const SLOPE_DEPTH_FACTOR: Record<SlopeLevel, number> = {
  flat: 1.0,
  moderate: 0.95,
  steep: 0.9,
};

/** Max continuous run before cycle-soak (minutes) by soil */
const MAX_CONTINUOUS_RUN: Record<SoilType, number> = {
  sand: 25,
  loam: 18,
  clay: 10,
};

const SLOPE_MAX_CONTINUOUS: Record<SlopeLevel, number> = {
  flat: Infinity,
  moderate: 15,
  steep: 10,
};

/** Soak rest between cycles (minutes) */
function soakMinutesBetweenCycles(soilType: SoilType, slopeLevel: SlopeLevel): number {
  if (soilType === "clay" && slopeLevel === "steep") return 45;
  if (soilType === "clay") return 30;
  if (slopeLevel === "steep") return 30;
  if (slopeLevel === "moderate") return 20;
  return 0;
}

export type CycleSoakPlan = {
  enabled: boolean;
  cycleCount: number;
  minutesPerCycle: number;
  soakMinutes: number;
  wallClockMinutes: number;
  description: string;
};

export type ZoneSchedule = {
  runtimeMinutes: number;
  adjustedRuntimeMinutes: number;
  daysPerWeek: number;
  daysLabel: string;
  startTime: string;
  finishTime: string;
  cycleSoak: CycleSoakPlan;
  targetDepthInches: number;
  precipRateInHr: number;
  applicationEfficiency: number;
  wateringWindowNote: string;
  sourceNote: string;
};

export function calculateTargetDepthInches(
  vegetationType: VegetationType,
  shadeLevel: ShadeLevel = "full_sun",
  soilType: SoilType = "loam",
  slopeLevel: SlopeLevel = "flat"
): number {
  const base = TARGET_DEPTH_INCHES[vegetationType];
  return (
    base *
    SHADE_DEPTH_FACTOR[shadeLevel] *
    SOIL_DEPTH_FACTOR[soilType] *
    SLOPE_DEPTH_FACTOR[slopeLevel]
  );
}

export function calculateDaysPerWeek(
  vegetationType: VegetationType,
  shadeLevel: ShadeLevel = "full_sun",
  soilType: SoilType = "loam"
): number {
  const raw =
    BASE_DAYS_PER_WEEK[vegetationType] *
    SHADE_DAYS_FACTOR[shadeLevel] *
    SOIL_DAYS_FACTOR[soilType];
  return Math.max(1, Math.min(7, Math.round(raw)));
}

export function calculateBaseRuntime(
  vegetationType: VegetationType,
  irrigationType: IrrigationType,
  shadeLevel: ShadeLevel = "full_sun",
  soilType: SoilType = "loam",
  slopeLevel: SlopeLevel = "flat"
): number {
  const spec = getManufacturerSpec(irrigationType);
  const targetDepth = calculateTargetDepthInches(
    vegetationType,
    shadeLevel,
    soilType,
    slopeLevel
  );
  const effectivePrecip = spec.precipRateInHr * spec.applicationEfficiency;

  if (effectivePrecip <= 0) return 0;

  const minutes = (targetDepth / effectivePrecip) * 60;
  return Math.max(1, Math.round(minutes));
}

export function calculateCycleSoak(
  totalRuntimeMinutes: number,
  irrigationType: IrrigationType,
  soilType: SoilType,
  slopeLevel: SlopeLevel
): CycleSoakPlan {
  const maxContinuous = Math.min(
    MAX_CONTINUOUS_RUN[soilType],
    SLOPE_MAX_CONTINUOUS[slopeLevel]
  );

  // Rotary/rotor on Utah clay benefit from cycle-soak even at moderate runtimes
  const rotaryBias =
    (irrigationType === "rotary" || irrigationType === "rotor") &&
    soilType === "clay" &&
    totalRuntimeMinutes > 20;

  const needsSoak =
    totalRuntimeMinutes > maxContinuous ||
    rotaryBias ||
    (slopeLevel !== "flat" && totalRuntimeMinutes > 12);

  if (!needsSoak) {
    return {
      enabled: false,
      cycleCount: 1,
      minutesPerCycle: totalRuntimeMinutes,
      soakMinutes: 0,
      wallClockMinutes: totalRuntimeMinutes,
      description: "Single continuous run",
    };
  }

  let cycleCount = Math.ceil(totalRuntimeMinutes / maxContinuous);
  cycleCount = Math.max(2, Math.min(cycleCount, 4));

  const minutesPerCycle = Math.ceil(totalRuntimeMinutes / cycleCount);
  const soakMinutes = soakMinutesBetweenCycles(soilType, slopeLevel);

  const wallClockMinutes =
    minutesPerCycle * cycleCount + soakMinutes * (cycleCount - 1);

  return {
    enabled: true,
    cycleCount,
    minutesPerCycle,
    soakMinutes,
    wallClockMinutes,
    description: `${cycleCount} cycles × ${minutesPerCycle} min with ${soakMinutes} min soak between`,
  };
}

export function formatTimeOfDay(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours24 = Math.floor(normalized / 60);
  const mins = normalized % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${mins.toString().padStart(2, "0")} ${period}`;
}

export function daysPerWeekLabel(days: number): string {
  if (days === 1) return "1 day/week";
  if (days === 2) return "2 days/week (e.g. Tue & Fri)";
  if (days === 3) return "3 days/week (e.g. Mon, Wed, Fri)";
  if (days === 4) return "4 days/week";
  return `${days} days/week`;
}

export function calculateZoneSchedule(
  params: {
    vegetationType: VegetationType;
    irrigationType: IrrigationType;
    shadeLevel?: ShadeLevel;
    soilType?: SoilType;
    slopeLevel?: SlopeLevel;
    temperatureF?: number;
    startMinutes?: number;
  }
): ZoneSchedule {
  const shadeLevel = params.shadeLevel ?? "full_sun";
  const soilType = params.soilType ?? "loam";
  const slopeLevel = params.slopeLevel ?? "flat";
  const temperatureF = params.temperatureF ?? 75;
  const startMinutes = params.startMinutes ?? DEFAULT_FIRST_START_MINUTES;

  const spec = getManufacturerSpec(params.irrigationType);
  const runtimeMinutes = calculateBaseRuntime(
    params.vegetationType,
    params.irrigationType,
    shadeLevel,
    soilType,
    slopeLevel
  );
  const adjustedRuntimeMinutes = applyTemperatureFactor(runtimeMinutes, temperatureF);
  const cycleSoak = calculateCycleSoak(
    adjustedRuntimeMinutes,
    params.irrigationType,
    soilType,
    slopeLevel
  );
  const daysPerWeek = calculateDaysPerWeek(
    params.vegetationType,
    shadeLevel,
    soilType
  );
  const finishMinutes = startMinutes + cycleSoak.wallClockMinutes;

  const finishesBeforeCutoff = finishMinutes <= UTAH_WATERING_WINDOW.bestFinishBy;
  const wateringWindowNote = finishesBeforeCutoff
    ? "Within Utah's recommended early-morning window (finish before ~9:30 AM)."
    : "May extend past ideal morning window — stagger zones earlier or split the valve.";

  return {
    runtimeMinutes,
    adjustedRuntimeMinutes,
    daysPerWeek,
    daysLabel: daysPerWeekLabel(daysPerWeek),
    startTime: formatTimeOfDay(startMinutes),
    finishTime: formatTimeOfDay(finishMinutes),
    cycleSoak,
    targetDepthInches: Math.round(
      calculateTargetDepthInches(
        params.vegetationType,
        shadeLevel,
        soilType,
        slopeLevel
      ) * 100
    ) / 100,
    precipRateInHr: spec.precipRateInHr,
    applicationEfficiency: spec.applicationEfficiency,
    wateringWindowNote,
    sourceNote: spec.notes,
  };
}

/** Stagger zone start times sequentially (typical single-valve-at-a-time controller) */
export function calculatePropertyStartTimes(
  zones: {
    id: string;
    vegetation_type: VegetationType | null;
    irrigation_type: IrrigationType | null;
    shade_level: ShadeLevel | null;
    soil_type: SoilType | null;
    slope_level: SlopeLevel | null;
    base_runtime_minutes: number | null;
  }[],
  options?: { firstStartMinutes?: number; temperatureF?: number }
): Map<string, { startTime: string; finishTime: string; schedule: ZoneSchedule }> {
  const firstStart = options?.firstStartMinutes ?? DEFAULT_FIRST_START_MINUTES;
  const temperatureF = options?.temperatureF ?? 75;
  const result = new Map<
    string,
    { startTime: string; finishTime: string; schedule: ZoneSchedule }
  >();

  let cursor = firstStart;

  for (const zone of zones) {
    if (!zone.vegetation_type || !zone.irrigation_type) continue;

    const schedule = calculateZoneSchedule({
      vegetationType: zone.vegetation_type,
      irrigationType: zone.irrigation_type,
      shadeLevel: zone.shade_level ?? "full_sun",
      soilType: zone.soil_type ?? "loam",
      slopeLevel: zone.slope_level ?? "flat",
      temperatureF,
      startMinutes: cursor,
    });

    result.set(zone.id, {
      startTime: schedule.startTime,
      finishTime: schedule.finishTime,
      schedule,
    });

    cursor += schedule.cycleSoak.wallClockMinutes;
  }

  return result;
}
