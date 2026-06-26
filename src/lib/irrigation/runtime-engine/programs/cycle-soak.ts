import type { IrrigationType, SlopeLevel, SoilType } from "../../types";
import type { CycleSoakPlan } from "../types";

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

function soakMinutesBetweenCycles(soilType: SoilType, slopeLevel: SlopeLevel): number {
  if (soilType === "clay" && slopeLevel === "steep") return 45;
  if (soilType === "clay") return 30;
  if (slopeLevel === "steep") return 30;
  if (slopeLevel === "moderate") return 20;
  return 0;
}

export function calculateCycleSoak(
  totalRuntimeMinutes: number,
  irrigationType: IrrigationType,
  soilType: SoilType,
  slopeLevel: SlopeLevel,
  enabled: boolean
): CycleSoakPlan {
  if (!enabled || totalRuntimeMinutes <= 0) {
    return {
      enabled: false,
      cycleCount: 1,
      minutesPerCycle: totalRuntimeMinutes,
      soakMinutes: 0,
      wallClockMinutes: totalRuntimeMinutes,
      description: "Single continuous run",
    };
  }

  const maxContinuous = Math.min(
    MAX_CONTINUOUS_RUN[soilType],
    SLOPE_MAX_CONTINUOUS[slopeLevel]
  );

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

/** Short cycles for new sod/seed establishment (2–4 cycles per day). */
export function establishmentCycleSoak(
  irrigationType: IrrigationType,
  soilType: SoilType
): CycleSoakPlan {
  const minutesPerCycle =
    irrigationType === "spray" ? 10 : irrigationType === "drip" ? 20 : 15;
  const cycleCount = soilType === "sand" ? 4 : soilType === "clay" ? 2 : 3;
  const soakMinutes = soilType === "clay" ? 45 : 30;

  return {
    enabled: true,
    cycleCount,
    minutesPerCycle,
    soakMinutes,
    wallClockMinutes: minutesPerCycle * cycleCount + soakMinutes * (cycleCount - 1),
    description: `Establishment: ${cycleCount} short cycles × ${minutesPerCycle} min (${soakMinutes} min soak)`,
  };
}
