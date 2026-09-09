import test from "node:test";
import assert from "node:assert/strict";
import { winterizationTabVisible } from "./visibility";

test("winterization tab is irrigation-only", () => {
  assert.equal(
    winterizationTabVisible({ irrigationFeaturesEnabled: false, winterizationTabMode: "ON" }),
    false
  );
});

test("scheduled window includes September", () => {
  assert.equal(
    winterizationTabVisible(
      {
        irrigationFeaturesEnabled: true,
        winterizationTabMode: "SCHEDULED",
        winterizationTabStartMonth: 8,
        winterizationTabStartDay: 1,
        winterizationTabEndMonth: 11,
        winterizationTabEndDay: 15,
      },
      new Date(2026, 8, 8)
    ),
    true
  );
  assert.equal(
    winterizationTabVisible(
      {
        irrigationFeaturesEnabled: true,
        winterizationTabMode: "SCHEDULED",
        winterizationTabStartMonth: 8,
        winterizationTabStartDay: 1,
        winterizationTabEndMonth: 11,
        winterizationTabEndDay: 15,
      },
      new Date(2026, 0, 15)
    ),
    false
  );
});
