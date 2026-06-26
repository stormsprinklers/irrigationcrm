import type {
  EstablishmentStage,
  PropertyScheduleSettings,
  RuntimeBreakdown,
  WeatherInput,
  ZoneRuntimeInput,
  ZoneRuntimeResult,
} from "../types";
import type { IrrigationType, ShadeLevel, SlopeLevel, SoilType, VegetationType } from "../../types";
import {
  daysPerWeekForVegetation,
  landscapeCoefficient,
} from "../coefficients/landscape-k";
import { effectiveRainForLandscape } from "../eto/effective-rain";
import { gallonsPerEvent, gallonsPerWeek } from "../hydraulics/gallons";
import {
  calculatePrecipitationRate,
  resolveDistributionUniformity,
  resolveZoneGpm,
} from "../hydraulics/precipitation-rate";
import {
  calculateCycleSoak,
  establishmentCycleSoak,
} from "../programs/cycle-soak";

const DEFAULT_VEGETATION: VegetationType = "grass";
const DEFAULT_IRRIGATION: IrrigationType = "spray";
const DEFAULT_SHADE: ShadeLevel = "full_sun";
const DEFAULT_SOIL: SoilType = "loam";
const DEFAULT_SLOPE: SlopeLevel = "flat";

export function calculateWeeklyRuntimeMinutes(params: {
  weeklyEToInches: number;
  Ks: number;
  Kd: number;
  Kmc: number;
  effectiveRainInches: number;
  precipitationRateInHr: number;
  distributionUniformity: number;
  useManagementEfficiency?: boolean;
}): { weeklyRuntimeMinutes: number; breakdown: Omit<RuntimeBreakdown, "totalGpm" | "prSource"> & { netWaterInches: number } } {
  const KL = params.Ks * params.Kd * params.Kmc;
  const landscapeETInches = params.weeklyEToInches * KL;
  const netWaterInches = Math.max(0, landscapeETInches - params.effectiveRainInches);

  const denominator =
    params.precipitationRateInHr *
    params.distributionUniformity *
    (params.useManagementEfficiency ? 0.9 : 1);

  const weeklyRuntimeMinutes =
    denominator > 0 ? Math.round((netWaterInches / denominator) * 60) : 0;

  return {
    weeklyRuntimeMinutes,
    breakdown: {
      weeklyEToInches: params.weeklyEToInches,
      Ks: params.Ks,
      Kd: params.Kd,
      Kmc: params.Kmc,
      KL,
      landscapeETInches: Math.round(landscapeETInches * 1000) / 1000,
      effectiveRainInches: params.effectiveRainInches,
      netWaterInches: Math.round(netWaterInches * 1000) / 1000,
      precipitationRateInHr: params.precipitationRateInHr,
      distributionUniformity: params.distributionUniformity,
    },
  };
}

function establishmentMultiplier(stage: EstablishmentStage): number {
  if (stage === "NEW_SOD") return 1.2;
  if (stage === "NEW_SEED") return 1.3;
  return 1;
}

export function calculateZoneRuntime(
  zone: ZoneRuntimeInput,
  settings: PropertyScheduleSettings,
  weather: WeatherInput,
  options?: { useManagementEfficiency?: boolean }
): ZoneRuntimeResult | null {
  const vegetationType = (zone.vegetationType ?? DEFAULT_VEGETATION) as VegetationType;
  const irrigationType = (zone.irrigationType ?? DEFAULT_IRRIGATION) as IrrigationType;
  const shadeLevel = (zone.shadeLevel ?? DEFAULT_SHADE) as ShadeLevel;
  const soilType = (zone.soilType ?? DEFAULT_SOIL) as SoilType;
  const slopeLevel = (zone.slopeLevel ?? DEFAULT_SLOPE) as SlopeLevel;
  const establishmentStage = zone.establishmentStage ?? "NORMAL";

  const weeklyEToInches =
    settings.etoOverrideInches ?? weather.weeklyEToInches;

  const { Ks, Kd, Kmc } = landscapeCoefficient(
    vegetationType,
    shadeLevel,
    slopeLevel,
    settings.grassSeason
  );

  const landscapeETPreview = weeklyEToInches * Ks * Kd * Kmc;
  const effectiveRainInches = effectiveRainForLandscape(
    weather.totalRainfallInches,
    landscapeETPreview
  );

  const totalGpm = resolveZoneGpm(
    irrigationType,
    zone.nozzleCount,
    zone.estimatedGpm,
    zone.nozzleGpm
  );

  const { precipRateInHr, source: prSource } = calculatePrecipitationRate(
    totalGpm,
    zone.irrigatedSqFt,
    irrigationType
  );

  const DU = resolveDistributionUniformity(
    irrigationType,
    zone.irrigationEfficiencyScore
  );

  const { weeklyRuntimeMinutes, breakdown } = calculateWeeklyRuntimeMinutes({
    weeklyEToInches,
    Ks,
    Kd,
    Kmc,
    effectiveRainInches,
    precipitationRateInHr: precipRateInHr,
    distributionUniformity: DU,
    useManagementEfficiency: options?.useManagementEfficiency,
  });

  const estMultiplier = establishmentMultiplier(establishmentStage);
  const adjustedWeeklyMinutes = Math.round(weeklyRuntimeMinutes * estMultiplier);

  const droughtMode = settings.droughtRestrictionsActive;
  const isEstablishment = establishmentStage !== "NORMAL";
  const daysPerWeek = isEstablishment
    ? 7
    : daysPerWeekForVegetation(vegetationType, shadeLevel, droughtMode);

  const runtimePerEventMinutes = Math.max(
    1,
    Math.round(adjustedWeeklyMinutes / daysPerWeek)
  );

  const cycleSoak = isEstablishment
    ? establishmentCycleSoak(irrigationType, soilType)
    : calculateCycleSoak(
        runtimePerEventMinutes,
        irrigationType,
        soilType,
        slopeLevel,
        settings.cycleSoakEnabled
      );

  const fullBreakdown: RuntimeBreakdown = {
    ...breakdown,
    totalGpm,
    prSource,
  };

  return {
    zoneId: zone.id,
    name: zone.name,
    stationNumber: zone.stationNumber ?? zone.sortOrder + 1,
    weeklyRuntimeMinutes: adjustedWeeklyMinutes,
    runtimePerEventMinutes,
    daysPerWeek,
    gallonsPerWeek: gallonsPerWeek(totalGpm, adjustedWeeklyMinutes),
    gallonsPerEvent: gallonsPerEvent(totalGpm, runtimePerEventMinutes),
    cycleSoak,
    breakdown: fullBreakdown,
    establishmentOverride: isEstablishment,
    establishmentNote: isEstablishment
      ? establishmentStage === "NEW_SOD"
        ? "Temporary new sod schedule: daily watering with short cycles for 7–14 days, then transition to normal ET-based schedule over 2–4 weeks."
        : "Temporary new seed schedule: daily light watering with short cycles until germination, then transition to normal ET-based schedule."
      : undefined,
  };
}

export function calculateAllZoneRuntimes(
  zones: ZoneRuntimeInput[],
  settings: PropertyScheduleSettings,
  weather: WeatherInput,
  options?: { useManagementEfficiency?: boolean }
): ZoneRuntimeResult[] {
  return zones
    .map((zone) => calculateZoneRuntime(zone, settings, weather, options))
    .filter((result): result is ZoneRuntimeResult => result != null);
}
