import test from "node:test";
import assert from "node:assert/strict";
import { effectiveRainSimple, effectiveRainForLandscape } from "../runtime-engine/eto/effective-rain";
import { duFromEfficiencyScore } from "../runtime-engine/hydraulics/precipitation-rate";
import { calculateWeeklyRuntimeMinutes } from "../runtime-engine/engine/calculate-zone-runtime";
import { calculatePrecipitationRate } from "../runtime-engine/hydraulics/precipitation-rate";
import { gallonsPerWeek } from "../runtime-engine/hydraulics/gallons";
import {
  buildControllerGuide,
  buildProgramTimeline,
  WATERING_WINDOW,
  formatTimeOfDay,
  parseTimeOfDay,
} from "../runtime-engine/programs/build-controller-guide";
import { daysPerWeekForVegetation } from "../runtime-engine/coefficients/landscape-k";
import { calculateZoneRuntime } from "../runtime-engine/engine/calculate-zone-runtime";
import { calculateCycleSoak } from "../runtime-engine/programs/cycle-soak";
import type { ZoneRuntimeInput } from "../runtime-engine/types";

test("effectiveRainSimple tiers", () => {
  assert.equal(effectiveRainSimple(0.05), 0);
  assert.equal(effectiveRainSimple(0.5), 0.4);
  assert.equal(effectiveRainSimple(1.5), 0.9 + (0.5 * 2) / 3);
});

test("effectiveRainForLandscape caps at landscape ET", () => {
  assert.equal(effectiveRainForLandscape(2, 0.5), 0.5);
});

test("duFromEfficiencyScore maps 1-10 to 0.40-0.85", () => {
  assert.equal(duFromEfficiencyScore(1), 0.4);
  assert.equal(duFromEfficiencyScore(10), 0.85);
  assert.ok(Math.abs((duFromEfficiencyScore(6) ?? 0) - 0.65) < 0.01);
});

test("core formula matches worked example (~191 min/week)", () => {
  const { weeklyRuntimeMinutes } = calculateWeeklyRuntimeMinutes({
    weeklyEToInches: 1.8,
    Ks: 0.8,
    Kd: 1.0,
    Kmc: 1.0,
    effectiveRainInches: 0.3,
    precipitationRateInHr: 0.55,
    distributionUniformity: 0.65,
  });
  assert.ok(weeklyRuntimeMinutes >= 185 && weeklyRuntimeMinutes <= 195);
});

test("PR falls back to catalog when sq ft missing", () => {
  const result = calculatePrecipitationRate(8, null, "spray");
  assert.equal(result.source, "catalog");
  assert.ok(result.precipRateInHr > 0);
});

test("PR calculated from GPM and sq ft", () => {
  const result = calculatePrecipitationRate(8, 1200, "spray");
  assert.equal(result.source, "calculated");
  assert.ok(Math.abs(result.precipRateInHr - 0.642) < 0.01);
});

test("gallonsPerWeek = GPM x weekly minutes", () => {
  assert.equal(gallonsPerWeek(8, 191), 1528);
});

test("drought mode limits to 2 days per week", () => {
  assert.equal(daysPerWeekForVegetation("grass", "full_sun", true), 2);
});

test("start times avoid 9am-6pm prohibited window", () => {
  const startMinutes = WATERING_WINDOW.earliestStartMinutes;
  assert.ok(startMinutes < WATERING_WINDOW.prohibitedStartMinutes);
  const formatted = formatTimeOfDay(startMinutes);
  assert.match(formatted, /5:00 AM/);
});

test("auto cycle-soak splits runtimes over 60 min into two runs", () => {
  const plan = calculateCycleSoak(95, "rotor", "loam", "flat", false);
  assert.equal(plan.enabled, true);
  assert.equal(plan.cycleCount, 2);
  assert.equal(plan.minutesPerCycle, 48);
  assert.equal(plan.soakMinutes, 30);
});

test("runtimes at or below 60 min stay single run when cycle-soak disabled", () => {
  const plan = calculateCycleSoak(60, "rotor", "loam", "flat", false);
  assert.equal(plan.enabled, false);
  assert.equal(plan.cycleCount, 1);
});

test("establishment override forces daily watering", () => {
  const zone: ZoneRuntimeInput = {
    id: "z1",
    name: "Zone 1",
    sortOrder: 0,
    vegetationType: "grass",
    shadeLevel: "full_sun",
    slopeLevel: "flat",
    soilType: "loam",
    irrigationType: "spray",
    nozzleCount: 4,
    estimatedGpm: 7.4,
    irrigatedSqFt: null,
    irrigationEfficiencyScore: 6,
    establishmentStage: "NEW_SOD",
    nozzleGpm: null,
  };
  const result = calculateZoneRuntime(
    zone,
    { grassSeason: "COOL", droughtRestrictionsActive: true, cycleSoakEnabled: false },
    { weeklyEToInches: 1.8, totalRainfallInches: 0, source: "open_meteo" }
  );
  assert.ok(result);
  assert.equal(result.daysPerWeek, 7);
  assert.equal(result.establishmentOverride, true);
  assert.ok(result.cycleSoak.enabled);
});

test("buildControllerGuide produces programs", () => {
  const guide = buildControllerGuide({
    propertyId: "prop1",
    settings: {
      grassSeason: "COOL",
      droughtRestrictionsActive: true,
      cycleSoakEnabled: false,
    },
    zones: [
      {
        id: "z1",
        name: "Front lawn",
        sortOrder: 0,
        vegetationType: "grass",
        shadeLevel: "full_sun",
        slopeLevel: "flat",
        soilType: "loam",
        irrigationType: "rotary",
        nozzleCount: 6,
        estimatedGpm: 2.88,
        irrigatedSqFt: 800,
        irrigationEfficiencyScore: 7,
        establishmentStage: "NORMAL",
        nozzleGpm: null,
      },
    ],
    weather: { weeklyEToInches: 1.8, totalRainfallInches: 0.3, source: "open_meteo" },
  });
  assert.ok(guide.programs.length >= 1);
  assert.equal(guide.droughtMode, true);
  assert.ok(guide.totalGallonsPerWeek > 0);
});

test("grass and shrubs share one program when watering days match", () => {
  const guide = buildControllerGuide({
    propertyId: "prop1",
    settings: {
      grassSeason: "COOL",
      droughtRestrictionsActive: true,
      cycleSoakEnabled: false,
    },
    zones: [
      {
        id: "z1",
        name: "Front lawn",
        sortOrder: 0,
        vegetationType: "grass",
        shadeLevel: "full_sun",
        slopeLevel: "flat",
        soilType: "loam",
        irrigationType: "rotary",
        nozzleCount: 6,
        estimatedGpm: 2.88,
        irrigatedSqFt: 800,
        irrigationEfficiencyScore: 7,
        establishmentStage: "NORMAL",
        nozzleGpm: null,
      },
      {
        id: "z2",
        name: "Shrubs",
        sortOrder: 1,
        vegetationType: "shrubs",
        shadeLevel: "full_sun",
        slopeLevel: "flat",
        soilType: "loam",
        irrigationType: "drip",
        nozzleCount: 4,
        estimatedGpm: 1.2,
        irrigatedSqFt: 200,
        irrigationEfficiencyScore: 8,
        establishmentStage: "NORMAL",
        nozzleGpm: null,
      },
    ],
    weather: { weeklyEToInches: 0.5, totalRainfallInches: 0.3, source: "open_meteo" },
  });
  assert.equal(guide.programs.length, 1);
  assert.equal(guide.programs[0].zones.length, 2);
});

test("programs with shared watering days do not overlap in time", () => {
  const guide = buildControllerGuide({
    propertyId: "prop1",
    settings: {
      grassSeason: "COOL",
      droughtRestrictionsActive: false,
      cycleSoakEnabled: false,
    },
    zones: [
      {
        id: "z1",
        name: "Front lawn",
        sortOrder: 0,
        vegetationType: "grass",
        shadeLevel: "full_sun",
        slopeLevel: "flat",
        soilType: "loam",
        irrigationType: "spray",
        nozzleCount: 4,
        estimatedGpm: 7.4,
        irrigatedSqFt: 1200,
        irrigationEfficiencyScore: 6,
        establishmentStage: "NORMAL",
        nozzleGpm: null,
      },
      {
        id: "z2",
        name: "Shrubs",
        sortOrder: 1,
        vegetationType: "shrubs",
        shadeLevel: "full_sun",
        slopeLevel: "flat",
        soilType: "loam",
        irrigationType: "drip",
        nozzleCount: 4,
        estimatedGpm: 1.2,
        irrigatedSqFt: 200,
        irrigationEfficiencyScore: 8,
        establishmentStage: "NORMAL",
        nozzleGpm: null,
      },
    ],
    weather: { weeklyEToInches: 1.8, totalRainfallInches: 0.3, source: "open_meteo" },
  });

  assert.equal(guide.programs.length, 2);
  const [programA, programB] = guide.programs;
  assert.ok(programA.startTimes.length >= 1);
  assert.ok(programB.startTimes.length >= 1);

  const programAEnd = parseTimeOfDay(
    programA.zones[programA.zones.length - 1].finishTime ?? programA.startTimes[0]
  );
  const programBStart = parseTimeOfDay(programB.startTimes[0]);
  assert.ok(programBStart >= programAEnd);
});

test("cycle-soak programs stagger zones and push later programs back", () => {
  const makeEntry = (
    id: string,
    stationNumber: number,
    minutesPerCycle: number,
    cycleCount: number,
    soakMinutes = 0
  ): import("../runtime-engine/types").ProgramZoneEntry => ({
    zoneId: id,
    name: `Zone ${stationNumber}`,
    stationNumber,
    weeklyRuntimeMinutes: minutesPerCycle * cycleCount * 2,
    runtimePerEventMinutes: minutesPerCycle * cycleCount,
    daysPerWeek: 2,
    gallonsPerWeek: 100,
    gallonsPerEvent: 50,
    cycleSoak: {
      enabled: cycleCount > 1,
      cycleCount,
      minutesPerCycle,
      soakMinutes,
      wallClockMinutes:
        minutesPerCycle * cycleCount + soakMinutes * Math.max(0, cycleCount - 1),
      description: "test",
    },
    breakdown: {
      weeklyEToInches: 1.8,
      Ks: 0.8,
      Kd: 1,
      Kmc: 1,
      KL: 0.8,
      landscapeETInches: 1.44,
      effectiveRainInches: 0,
      netWaterInches: 1.44,
      precipitationRateInHr: 0.55,
      distributionUniformity: 0.65,
      totalGpm: 8,
      prSource: "catalog",
    },
    establishmentOverride: false,
  });

  const longProgram = buildProgramTimeline(
    [makeEntry("z1", 1, 30, 2), makeEntry("z2", 2, 30, 2)],
    5 * 60,
    2
  );
  assert.equal(longProgram.startTimes.length, 2);
  assert.equal(parseTimeOfDay(longProgram.startTimes[0]), 5 * 60);
  assert.equal(parseTimeOfDay(longProgram.startTimes[1]), 6 * 60);
  assert.equal(parseTimeOfDay(longProgram.zones[1].finishTime!), 7 * 60);

  const guide = buildControllerGuide({
    propertyId: "prop1",
    settings: {
      grassSeason: "COOL",
      droughtRestrictionsActive: true,
      cycleSoakEnabled: false,
    },
    zones: [
      {
        id: "z1",
        name: "Zone 1",
        sortOrder: 0,
        vegetationType: "grass",
        shadeLevel: "full_sun",
        slopeLevel: "flat",
        soilType: "loam",
        irrigationType: "rotor",
        nozzleCount: 4,
        estimatedGpm: 8,
        irrigatedSqFt: 1200,
        irrigationEfficiencyScore: 6,
        establishmentStage: "NORMAL",
        nozzleGpm: null,
      },
      {
        id: "z2",
        name: "Zone 2",
        sortOrder: 1,
        vegetationType: "grass",
        shadeLevel: "full_sun",
        slopeLevel: "flat",
        soilType: "loam",
        irrigationType: "rotor",
        nozzleCount: 4,
        estimatedGpm: 8,
        irrigatedSqFt: 1200,
        irrigationEfficiencyScore: 6,
        establishmentStage: "NORMAL",
        nozzleGpm: null,
      },
      {
        id: "z3",
        name: "Shrubs",
        sortOrder: 2,
        vegetationType: "shrubs",
        shadeLevel: "full_sun",
        slopeLevel: "flat",
        soilType: "loam",
        irrigationType: "drip",
        nozzleCount: 4,
        estimatedGpm: 1.2,
        irrigatedSqFt: 200,
        irrigationEfficiencyScore: 8,
        establishmentStage: "NORMAL",
        nozzleGpm: null,
      },
    ],
    weather: { weeklyEToInches: 1.2, totalRainfallInches: 0, source: "open_meteo" },
  });

  assert.equal(guide.programs.length, 2);
  const twoCycleProgram = guide.programs.find((program) => program.startTimes.length === 2);
  const oneCycleProgram = guide.programs.find((program) => program.startTimes.length === 1);
  assert.ok(twoCycleProgram);
  assert.ok(oneCycleProgram);

  const twoCycleEnd = parseTimeOfDay(twoCycleProgram.zones.at(-1)!.finishTime!);
  assert.equal(parseTimeOfDay(oneCycleProgram.startTimes[0]), twoCycleEnd);
});
