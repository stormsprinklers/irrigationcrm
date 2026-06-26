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

const ALL_DAYS: DayOfWeekCode[] = [
  "SUN",
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
];

const PROGRAM_IDS: ProgramId[] = ["A", "B", "C"];

export function formatTimeOfDay(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours24 = Math.floor(normalized / 60);
  const mins = normalized % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${mins.toString().padStart(2, "0")} ${period}`;
}

export function parseTimeOfDay(label: string): number {
  const match = label.match(/^(\d{1,2}):(\d{2}) (AM|PM)$/);
  if (!match) throw new Error(`Invalid time label: ${label}`);
  let hours = Number.parseInt(match[1], 10);
  const mins = Number.parseInt(match[2], 10);
  const period = match[3];
  if (period === "AM" && hours === 12) hours = 0;
  if (period === "PM" && hours !== 12) hours += 12;
  return hours * 60 + mins;
}

/** Round up to the next 10-minute controller start-time slot. */
export function roundUpToTenMinutes(totalMinutes: number): number {
  return Math.ceil(totalMinutes / 10) * 10;
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

function resolveZoneDaysOfWeek(
  zone: ZoneRuntimeInput,
  result: ZoneRuntimeResult,
  droughtMode: boolean
): DayOfWeekCode[] {
  if (result.establishmentOverride) return ALL_DAYS;
  if (droughtMode) return [...DROUGHT_DAYS];

  const vegetationType = (zone.vegetationType ?? "grass") as VegetationType;
  return DEFAULT_DAYS_BY_VEGETATION[vegetationType].slice(0, result.daysPerWeek);
}

function programCycleCount(result: ZoneRuntimeResult): number {
  return result.cycleSoak.enabled ? result.cycleSoak.cycleCount : 1;
}

function scheduleGroupKey(
  days: DayOfWeekCode[],
  result: ZoneRuntimeResult
): string {
  return `${days.join(",")}|${result.establishmentOverride ? "est" : "norm"}|c${programCycleCount(result)}`;
}

type ProgramDraft = {
  key: string;
  daysOfWeek: DayOfWeekCode[];
  isEstablishment: boolean;
  cycleCount: number;
  items: { zone: ZoneRuntimeInput; result: ZoneRuntimeResult }[];
  startTimes: string[];
  zones: ProgramZoneEntry[];
  totalWallClockMinutes: number;
  totalGallonsPerWeek: number;
};

function clusterZonesIntoPrograms(
  zoneResults: ZoneRuntimeResult[],
  zones: ZoneRuntimeInput[],
  droughtMode: boolean
): ProgramDraft[] {
  const groups = new Map<string, ProgramDraft>();

  for (const result of zoneResults) {
    const zone = zones.find((z) => z.id === result.zoneId);
    if (!zone) continue;

    const daysOfWeek = resolveZoneDaysOfWeek(zone, result, droughtMode);
    const key = scheduleGroupKey(daysOfWeek, result);
    const cycleCount = programCycleCount(result);

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        daysOfWeek,
        isEstablishment: result.establishmentOverride,
        cycleCount,
        items: [],
        startTimes: [],
        zones: [],
        totalWallClockMinutes: 0,
        totalGallonsPerWeek: 0,
      });
    }

    groups.get(key)!.items.push({ zone, result });
  }

  return [...groups.values()].sort((a, b) => {
    if (a.isEstablishment !== b.isEstablishment) {
      return a.isEstablishment ? 1 : -1;
    }
    const minStationA = Math.min(...a.items.map((item) => item.result.stationNumber));
    const minStationB = Math.min(...b.items.map((item) => item.result.stationNumber));
    return minStationA - minStationB;
  });
}

function daysOverlap(a: DayOfWeekCode[], b: DayOfWeekCode[]): boolean {
  const setA = new Set(a);
  return b.some((day) => setA.has(day));
}

export type ProgramTimeline = {
  startTimes: string[];
  zones: ProgramZoneEntry[];
  endMinutes: number;
};

export function buildProgramTimeline(
  entries: ProgramZoneEntry[],
  baseStartMinutes: number,
  cycleCount: number
): ProgramTimeline {
  const sorted = [...entries].sort((a, b) => a.stationNumber - b.stationNumber);
  const zoneTiming = new Map<
    string,
    { firstStart?: number; lastFinish?: number }
  >();
  for (const entry of sorted) {
    zoneTiming.set(entry.zoneId, {});
  }

  const startTimesMinutes: number[] = [];
  let cursor = roundUpToTenMinutes(baseStartMinutes);

  for (let cycle = 0; cycle < cycleCount; cycle++) {
    cursor = roundUpToTenMinutes(cursor);
    startTimesMinutes.push(cursor);

    for (const entry of sorted) {
      const activeCycle = cycle < entry.cycleSoak.cycleCount;
      const minutes = activeCycle ? entry.cycleSoak.minutesPerCycle : 0;
      if (minutes <= 0) continue;

      const timing = zoneTiming.get(entry.zoneId)!;
      if (timing.firstStart == null) timing.firstStart = cursor;
      timing.lastFinish = cursor + minutes;
      cursor += minutes;
    }

    if (cycle < cycleCount - 1) {
      const soakMinutes = sorted.reduce((max, entry) => {
        if (cycle + 1 >= entry.cycleSoak.cycleCount) return max;
        return Math.max(max, entry.cycleSoak.soakMinutes);
      }, 0);
      cursor += soakMinutes;
    }
  }

  const zones = sorted.map((entry) => {
    const timing = zoneTiming.get(entry.zoneId)!;
    return {
      ...entry,
      startTime:
        timing.firstStart != null ? formatTimeOfDay(timing.firstStart) : undefined,
      finishTime:
        timing.lastFinish != null ? formatTimeOfDay(timing.lastFinish) : undefined,
    };
  });

  return {
    startTimes: startTimesMinutes.map(formatTimeOfDay),
    zones,
    endMinutes: cursor,
  };
}

function assignNonOverlappingSchedules(drafts: ProgramDraft[]): void {
  const scheduled: { daysOfWeek: DayOfWeekCode[]; endMinutes: number }[] = [];

  for (const draft of drafts) {
    draft.items.sort((a, b) => a.result.stationNumber - b.result.stationNumber);

    let baseStart = roundUpToTenMinutes(WATERING_WINDOW.earliestStartMinutes);
    for (const previous of scheduled) {
      if (daysOverlap(previous.daysOfWeek, draft.daysOfWeek)) {
        baseStart = Math.max(baseStart, roundUpToTenMinutes(previous.endMinutes));
      }
    }

    const entries: ProgramZoneEntry[] = draft.items.map(({ result }) => ({ ...result }));
    const timeline = buildProgramTimeline(entries, baseStart, draft.cycleCount);

    draft.startTimes = timeline.startTimes;
    draft.zones = timeline.zones;
    draft.totalWallClockMinutes = timeline.endMinutes - baseStart;
    draft.totalGallonsPerWeek = draft.zones.reduce((sum, zone) => sum + zone.gallonsPerWeek, 0);

    scheduled.push({
      daysOfWeek: draft.daysOfWeek,
      endMinutes: timeline.endMinutes,
    });
  }
}

function programLabel(
  programId: ProgramId,
  daysOfWeek: DayOfWeekCode[],
  isEstablishment: boolean
): string {
  if (isEstablishment) {
    return `Program ${programId} — Establishment (temporary)`;
  }
  return `Program ${programId} — ${daysLabel(daysOfWeek)}`;
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

  const drafts = clusterZonesIntoPrograms(
    zoneResults,
    params.zones,
    params.settings.droughtRestrictionsActive
  );
  assignNonOverlappingSchedules(drafts);

  const programs: ControllerProgram[] = [];
  const notes: string[] = [];

  drafts.slice(0, PROGRAM_IDS.length).forEach((draft, index) => {
    const programId = PROGRAM_IDS[index];
    programs.push({
      id: programId,
      label: programLabel(programId, draft.daysOfWeek, draft.isEstablishment),
      daysOfWeek: draft.daysOfWeek,
      daysLabel: daysLabel(draft.daysOfWeek),
      startTimes: draft.startTimes,
      zones: draft.zones,
      totalWallClockMinutes: draft.totalWallClockMinutes,
      totalGallonsPerWeek: draft.totalGallonsPerWeek,
      isEstablishment: draft.isEstablishment,
    });
  });

  if (drafts.length > PROGRAM_IDS.length) {
    notes.push(
      `More than ${PROGRAM_IDS.length} distinct schedules were detected; only the first ${PROGRAM_IDS.length} are shown. Adjust zone watering days or cycle counts to consolidate.`
    );
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
