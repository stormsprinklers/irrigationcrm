import test from "node:test";
import assert from "node:assert/strict";
import { calculateBaseRuntime, calculateZoneSchedule } from "../runtime";

test("calculateBaseRuntime returns positive minutes for grass spray", () => {
  const runtime = calculateBaseRuntime("grass", "spray");
  assert.ok(runtime > 0);
});

test("calculateZoneSchedule includes days per week", () => {
  const schedule = calculateZoneSchedule({
    vegetationType: "grass",
    irrigationType: "spray",
  });
  assert.ok(schedule.daysPerWeek >= 1);
  assert.match(schedule.daysLabel, /week/);
});
