import test from "node:test";
import assert from "node:assert/strict";
import { computeHolidayQuotePricing } from "../pricing";
import { DEFAULT_HOLIDAY_CATALOG, parseHolidaySelections } from "../types";

const style = DEFAULT_HOLIDAY_CATALOG.lightStyles[0]!;
const prices = new Map([
  [style.temporaryYear1Sku, { id: "buy", name: "Buy", unitPrice: 10, unitCost: null }],
  [style.temporaryReinstallSku, { id: "reinstall", name: "Reinstall", unitPrice: 5, unitCost: null }],
  [style.leaseSku, { id: "lease", name: "Lease", unitPrice: 8, unitCost: null }],
  [style.permanentSku, { id: "permanent", name: "Permanent", unitPrice: 20, unitCost: null }],
]);
const measurements = {
  segments: [{ id: "roof", label: "Roof", kind: "roofline" as const, path: [], lengthFt: 10 }],
  placements: [],
};

test("quote-specific prices and discounts survive parsing and affect each option", () => {
  const selections = parseHolidaySelections({
    defaultLightStyleKey: style.key,
    installKind: "temporary",
    reinstallPrice: 45,
    optionAdjustments: {
      buy: { price: 120, discountType: "fixed", discountAmount: 30 },
      lease: { discountType: "percent", discountAmount: 25 },
      permanent: { discountType: "percent", discountAmount: 10 },
    },
  });
  const result = computeHolidayQuotePricing({ catalog: DEFAULT_HOLIDAY_CATALOG, measurements, selections, prices });
  assert.deepEqual(result.optionDetails.buy, { calculated: 100, subtotal: 120, discountTotal: 30, total: 90 });
  assert.deepEqual(result.optionDetails.lease, { calculated: 80, subtotal: 80, discountTotal: 20, total: 60 });
  assert.equal(result.permanentTotal, 180);
  assert.equal(result.reinstallTotal, 45);
});

test("discounts cannot reduce an option below zero", () => {
  const selections = parseHolidaySelections({ optionAdjustments: { buy: { price: 20, discountType: "fixed", discountAmount: 100 } } });
  const result = computeHolidayQuotePricing({ catalog: DEFAULT_HOLIDAY_CATALOG, measurements, selections, prices });
  assert.equal(result.optionDetails.buy.discountTotal, 20);
  assert.equal(result.year1Total, 0);
});
