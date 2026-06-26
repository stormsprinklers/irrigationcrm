import test from "node:test";
import assert from "node:assert/strict";
import { effectiveRainSimple, effectiveRainForLandscape } from "../runtime-engine/eto/effective-rain";
import { duFromEfficiencyScore } from "../runtime-engine/hydraulics/precipitation-rate";
import { calculateWeeklyRuntimeMinutes } from "../runtime-engine/engine/calculate-zone-runtime";
import { calculatePrecipitationRate } from "../runtime-engine/hydraulics/precipitation-rate";
import { gallonsPerWeek } from "../runtime-engine/hydraulics/gallons";
import {
  buildControllerGuide,
  WATERING_WINDOW,
  formatTimeOfDay,
} from "../runtime-engine/programs/build-controller-guide";
import { daysPerWeekForVegetation } from "../runtime-engine/coefficients/landscape-k";
import { calculateZoneRuntime } from "../runtime-engine/engine/calculate-zone-runtime";
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
