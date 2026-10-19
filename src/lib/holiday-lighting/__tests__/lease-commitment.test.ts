import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateHolidayLeaseCommitmentPricing,
  holidayLeaseCommitmentDiscount,
  withHolidayLeaseCommitmentDescription,
} from "../lease-commitment";

test("lease commitments recalculate annual pricing while preserving manual discounts", () => {
  const manualDiscount = {
    optionId: "lease",
    label: "Early booking",
    type: "PERCENT",
    amount: 5,
  };
  const oldCommitment = holidayLeaseCommitmentDiscount("lease", 3)!;

  assert.deepEqual(
    calculateHolidayLeaseCommitmentPricing({
      subtotal: 1_000,
      years: 1,
      discounts: [oldCommitment, manualDiscount],
    }),
    {
      subtotal: 1_000,
      contractDiscountPercent: 0,
      contractDiscountTotal: 0,
      manualDiscountTotal: 50,
      discountTotal: 50,
      total: 950,
    }
  );
  assert.equal(
    calculateHolidayLeaseCommitmentPricing({
      subtotal: 1_000,
      years: 5,
      discounts: [oldCommitment, manualDiscount],
    }).total,
    750
  );
});

test("lease commitment copy follows the customer selection", () => {
  const detail = "Single Season · No Commitment\n\nIncludes installation and takedown.";
  assert.equal(
    withHolidayLeaseCommitmentDescription(detail, 3),
    "3-Year Commitment · Save 10% Each Year\n\nIncludes installation and takedown."
  );
});
