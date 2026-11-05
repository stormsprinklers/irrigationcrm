import assert from "node:assert/strict";
import test from "node:test";
import type { PriceLookup } from "../pricing";
import {
  applyHolidayPricingSnapshot,
  holidayPricingSnapshotChanged,
  snapshotHolidayPrices,
} from "../quote-prices";
import { parseHolidaySelections } from "../types";

function prices(unitPrice: number, unitCost = 2): PriceLookup {
  return new Map([
    ["HL-C9-SERVICE-FT", {
      id: "c9",
      name: "C9 service",
      unitPrice,
      unitCost,
    }],
  ]);
}

test("quote pricing snapshots keep the original rate after the price book changes", () => {
  const snapshot = snapshotHolidayPrices(prices(3.49));
  const effective = applyHolidayPricingSnapshot(prices(3.99, 2.5), snapshot);

  assert.equal(effective.get("HL-C9-SERVICE-FT")?.unitPrice, 3.49);
  assert.equal(effective.get("HL-C9-SERVICE-FT")?.unitCost, 2);
  assert.equal(holidayPricingSnapshotChanged(prices(3.99, 2.5), snapshot), true);
});

test("saved quote rates survive selection parsing", () => {
  const selections = parseHolidaySelections({
    pricingSnapshot: {
      "HL-C9-SERVICE-FT": { unitPrice: 3.49, unitCost: 2 },
    },
  });

  assert.deepEqual(selections.pricingSnapshot, {
    "HL-C9-SERVICE-FT": { unitPrice: 3.49, unitCost: 2 },
  });
});
