import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import {
  canEditEstimateHolidayLightingSpecs,
  canEditVisitHolidayLightingSpecs,
} from "@/lib/holiday-lighting/spec-permissions";
import {
  parseHolidayLightingSpecPatch,
  updateHolidayLightingSpecs,
} from "@/lib/holiday-lighting/specs";

const metadata = {
  source: "holiday-lighting-quote",
  options: [
    {
      letter: "A",
      colorPattern: "Warm White",
      strandColor: "Black",
      strandMap: { features: [{ id: "a", bulbColors: "Warm White" }] },
    },
    {
      letter: "B",
      colorPattern: "Red",
      strandColor: "Green",
      strandMap: { features: [{ id: "b", bulbColors: "Red" }] },
    },
  ],
};

test("CSR can edit holiday lighting specs on estimates and visits", () => {
  assert.equal(canEditEstimateHolidayLightingSpecs(UserRole.CSR), true);
  assert.equal(canEditVisitHolidayLightingSpecs(UserRole.CSR), true);
  assert.equal(canEditEstimateHolidayLightingSpecs(UserRole.BULB_PREP), false);
  assert.equal(canEditVisitHolidayLightingSpecs(UserRole.MARKETER), false);
});

test("estimate changes update only the selected holiday option", () => {
  const updated = updateHolidayLightingSpecs(
    metadata,
    parseHolidayLightingSpecPatch({ colorPattern: "Blue", strandColor: "White" }),
    { optionLetter: "B" }
  );
  const options = updated.options as Array<Record<string, unknown>>;
  assert.equal(options[0].colorPattern, "Warm White");
  assert.equal(options[1].colorPattern, "Blue");
  assert.equal(options[1].strandColor, "White");
  assert.deepEqual(options[1].strandMap, {
    features: [{ id: "b", bulbColors: "Blue" }],
  });
});

test("visit changes become authoritative and update mapped bulb colors", () => {
  const updated = updateHolidayLightingSpecs(
    {
      source: "holiday-lighting-quote",
      colorPattern: "Warm White",
      strandMap: { features: [{ id: "roof", bulbColors: "Warm White" }] },
    },
    { colorPattern: "Red / Warm White alternating" },
    { markVisitOverride: true }
  );
  assert.equal(updated.visitSpecsUpdated, true);
  assert.equal(updated.colorPattern, "Red / Warm White alternating");
  assert.deepEqual(updated.strandMap, {
    features: [{ id: "roof", bulbColors: "Red / Warm White alternating" }],
  });
});

test("invalid strand and unspecified custom colors are rejected", () => {
  assert.throws(
    () => parseHolidayLightingSpecPatch({ strandColor: "Purple" }),
    /Black, White, or Green/
  );
  assert.throws(
    () => parseHolidayLightingSpecPatch({ colorPattern: "Other" }),
    /specific light color/
  );
});
