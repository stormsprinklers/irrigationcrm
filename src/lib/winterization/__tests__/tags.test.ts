import test from "node:test";
import assert from "node:assert/strict";
import { winterizationSeasonTag } from "../weeks";

test("winterizationSeasonTag uses the season year", () => {
  assert.equal(winterizationSeasonTag(2026), "winterizations_2026");
  assert.equal(winterizationSeasonTag(2027), "winterizations_2027");
});
