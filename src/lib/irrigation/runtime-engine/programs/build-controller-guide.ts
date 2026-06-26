import type {
  CalculatePropertyRuntimeParams,
  ControllerProgram,
  ControllerProgramGuide,
  DayOfWeekCode,
  ProgramId,
  ProgramZoneEntry,
  ZoneRuntimeInput,
  ZoneRuntimeResult,
} from "../types";
import type { VegetationType } from "../../types";
import { DEFAULT_DAYS_BY_VEGETATION, DROUGHT_DAYS } from "../coefficients/landscape-k";
import { effectiveRainForLandscape } from "../eto/effective-rain";
import { calculateAllZoneRuntimes } from "../engine/calculate-zone-runtime";

export const WATERING_WINDOW = {
  earliestStartMinutes: 5 * 60,
  bestFinishByMinutes: 9 * 60 + 30,
  prohibitedStartMinutes: 9 * 60,
  prohibitedEndMinutes: 18 * 60,
};

export function formatTimeOfDay(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours24 = Math.floor(normalized / 60);
  const mins = normalized % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${mins.toString().padStart(2, "0")} ${period}`;
}

function daysLabel(days: DayOfWeekCode[]): string {
  const labels: Record<DayOfWeekCode, string> = {
    SUN: "Sun",
    MON: "Mon",
    TUE: "Tue",
    WED: "Wed",
    THU: "Thu",
    FRI: "Fri",
    SAT: "Sat",
  };
  return days.map((d) => labels[d]).join(", ");
}

function programForVegetation(vegetationType: VegetationType | null): ProgramId {
  if (!vegetationType || vegetationType === "grass") return "A";
  return "B";
}

function assignPrograms(
  zoneResults: ZoneRuntimeResult[],
  zones: ZoneRuntimeInput[]
): Map<ProgramId, { zone: ZoneRuntimeInput; result: ZoneRuntimeResult }[]> {
  const map = new Map<ProgramId, { zone: ZoneRuntimeInput; result: ZoneRuntimeResult }[]>();
  map.set("A", []);
  map.set("B", []);
  map.set("C", []);

  for (const result of zoneResults) {
    const zone = zones.find((z) => z.id === result.zoneId);
    if (!zone) continue;
    const programId = result.establishmentOverride
      ? "C"
      : programForVegetation(zone.vegetationType as VegetationType | null);
    map.get(programId)!.push({ zone, result });
  }

  return map;
}

function resolveDaysOfWeek(
  zoneResults: { result: ZoneRuntimeResult; zone: ZoneRuntimeInput }[],
  droughtMode: boolean
): DayOfWeekCode[] {
  if (droughtMode) return DROUGHT_DAYS;

  const establishment = zoneResults.some((z) => z.result.establishmentOverride);
  if (establishment) {
    return ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  }

  const vegetationTypes = new Set(
    zoneResults.map((z) => (z.zone.vegetationType ?? "grass") as VegetationType)
  );

  if (vegetationTypes.size === 1) {
    const vt = [...vegetationTypes][0];
    return DEFAULT_DAYS_BY_VEGETATION[vt].slice(0, zoneResults[0]?.result.daysPerWeek ?? 3);
  }

  return DEFAULT_DAYS_BY_VEGETATION.grass.slice(0, zoneResults[0]?.result.daysPerWeek ?? 3);
}

function buildStartTimes(wallClockPerRun: number, maxStartTimes = 3): string[] {
  const windowMinutes =
    WATERING_WINDOW.prohibitedStartMinutes - WATERING_WINDOW.earliestStartMinutes;

  if (wallClockPerRun <= windowMinutes) {
    return [formatTimeOfDay(WATERING_WINDOW.earliestStartMinutes)];
  }

  const needed = Math.min(
    maxStartTimes,
    Math.ceil(wallClockPerRun / windowMinutes)
  );

  if (needed <= 1) {
    return [formatTimeOfDay(WATERING_WINDOW.earliestStartMinutes)];
  }

  const gap = Math.floor(windowMinutes / needed);
  return Array.from({ length: needed }, (_, i) =>
    formatTimeOfDay(WATERING_WINDOW.earliestStartMinutes + i * gap)
  );
}

function staggerZones(
  entries: ProgramZoneEntry[],
  startMinutes: number
): ProgramZoneEntry[] {
  let cursor = startMinutes;
  return entries.map((entry) => {
    const startTime = formatTimeOfDay(cursor);
    const finishTime = formatTimeOfDay(cursor + entry.cycleSoak.wallClockMinutes);
    cursor += entry.cycleSoak.wallClockMinutes;
    return { ...entry, startTime, finishTime };
  });
}

export function buildControllerGuide(
  params: CalculatePropertyRuntimeParams
): ControllerProgramGuide {
  const zoneResults = calculateAllZoneRuntimes(
    params.zones,
    params.settings,
    params.weather,
    { useManagementEfficiency: params.useManagementEfficiency }
  );

  const weeklyEToInches =
    params.settings.etoOverrideInches ?? params.weather.weeklyEToInches;

  const avgKL =
    zoneResults.length > 0
      ? zoneResults.reduce((s, z) => s + z.breakdown.KL, 0) / zoneResults.length
      : 0.8;

  const landscapeET = weeklyEToInches * avgKL;
  const effectiveRainInches = effectiveRainForLandscape(
    params.weather.totalRainfallInches,
    landscapeET
  );

  const programMap = assignPrograms(zoneResults, params.zones);
  const programs: ControllerProgram[] = [];
  const notes: string[] = [];

  if (params.settings.droughtRestrictionsActive) {
    notes.push("Drought restrictions active: watering limited to 2 days per week (Tue & Fri).");
  }

  notes.push("No watering between 9:00 AM and 6:00 PM. Prefer early morning start times.");

  if (!params.settings.cycleSoakEnabled) {
    notes.push("Cycle-soak is off. Enable in property settings for clay or sloped zones.");
  }

  const programLabels: Record<ProgramId, string> = {
    A: "Program A — Turf",
    B: "Program B — Shrubs / drip / specialty",
    C: "Program C — Establishment (temporary)",
  };

  for (const programId of ["A", "B", "C"] as ProgramId[]) {
    const group = programMap.get(programId) ?? [];
    if (!group.length) continue;

    group.sort((a, b) => a.result.stationNumber - b.result.stationNumber);

    const daysOfWeek = resolveDaysOfWeek(group, params.settings.droughtRestrictionsActive);
    const programZones: ProgramZoneEntry[] = group.map(({ result }) => ({ ...result }));

    const totalWallClock = programZones.reduce(
      (sum, z) => sum + z.cycleSoak.wallClockMinutes,
      0
    );

    const startTimes = buildStartTimes(totalWallClock);
    const staggered = staggerZones(programZones, WATERING_WINDOW.earliestStartMinutes);

    programs.push({
      id: programId,
      label: programLabels[programId],
      daysOfWeek,
      daysLabel: daysLabel(daysOfWeek),
      startTimes,
      zones: staggered,
      totalWallClockMinutes: totalWallClock,
      totalGallonsPerWeek: programZones.reduce((s, z) => s + z.gallonsPerWeek, 0),
      isEstablishment: programId === "C",
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    propertyId: params.propertyId,
    weeklyEToInches,
    totalRainfallInches: params.weather.totalRainfallInches,
    effectiveRainInches: Math.round(effectiveRainInches * 1000) / 1000,
    droughtMode: params.settings.droughtRestrictionsActive,
    cycleSoakEnabled: params.settings.cycleSoakEnabled,
    grassSeason: params.settings.grassSeason,
    weatherSource: params.weather.source,
    programs,
    totalGallonsPerWeek: zoneResults.reduce((s, z) => s + z.gallonsPerWeek, 0),
    notes,
  };
}
