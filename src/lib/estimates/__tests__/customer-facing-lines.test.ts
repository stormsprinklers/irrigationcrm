import test from "node:test";
import assert from "node:assert/strict";
import { customerFacingEstimateLines } from "../customer-facing-lines";

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
