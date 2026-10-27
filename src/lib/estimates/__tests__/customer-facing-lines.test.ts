import test from "node:test";
import assert from "node:assert/strict";
import {
  customerFacingEstimateLines,
  customerFacingHolidayPlacementName,
} from "../customer-facing-lines";

test("holiday placement names omit legacy tree and bush prefixes", () => {
  assert.equal(customerFacingHolidayPlacementName("Tree - Front maple"), "Front maple");
  assert.equal(customerFacingHolidayPlacementName("Tree wrap — Front maple — parts"), "Front maple — parts");
  assert.equal(customerFacingHolidayPlacementName("Bush: Entry planters"), "Entry planters");
  assert.equal(customerFacingHolidayPlacementName("Entry garland"), "Entry garland");
});

test("legacy labor minimum adjustment is hidden and folded into roofline labor", () => {
  const lines = customerFacingEstimateLines([
    { name: "Roofline — labor only", quantity: 1, unitPrice: 300, total: 300 },
    { name: "Tree — labor only", quantity: 1, unitPrice: 50, total: 50 },
    { name: "Labor minimum adjustment", quantity: 1, unitPrice: -76.72, total: -76.72 },
  ]);

  assert.deepEqual(lines, [
    { name: "Roofline — labor only", quantity: 1, unitPrice: 223.28, total: 223.28 },
    { name: "Tree — labor only", quantity: 1, unitPrice: 50, total: 50 },
  ]);
});

test("permanent holiday-lighting options omit legacy storage and maintenance rows", () => {
  const lines = customerFacingEstimateLines([
    { name: "Permanent Lights", total: 5000, quantity: 1, unitPrice: 5000, unit: "each" },
    { name: "Storage", total: 0, quantity: 1, unitPrice: 0, unit: "included" },
    { name: "Maintenance", total: 0, quantity: 1, unitPrice: 0, unit: "included" },
    {
      name: "5-year parts and labor warranty",
      total: 0,
      quantity: 1,
      unitPrice: 0,
      unit: "included",
    },
  ]);

  assert.deepEqual(
    lines.map((line) => line.name),
    ["Permanent Lights", "5-year parts and labor warranty"]
  );
});
