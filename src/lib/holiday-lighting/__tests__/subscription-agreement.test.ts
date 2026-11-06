import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHolidaySubscriptionAgreement,
  isSeasonalHolidaySubscriptionOption,
} from "../subscription-agreement";

test("seasonal agreement fills Exhibit A and itemized Exhibit B from the selected option", () => {
  const agreement = buildHolidaySubscriptionAgreement({
    estimateNumber: "EST-2041",
    selectedOptionId: "option-b",
    optionLabel: "Classic Roofline",
    optionTotal: 1_598,
    optionMetadata: {
      cancellationFee: 812.5,
      cancellationItems: [
        {
          id: "bulbs",
          name: "C9 LED bulbs",
          quantity: 125,
          unitMsrp: 4.5,
          total: 562.5,
        },
        { id: "timer", name: "Outdoor timer", quantity: 1, unitMsrp: 250, total: 250 },
      ],
    },
    lineItems: [
      { optionId: "option-b", name: "Roofline", unit: "each", total: 1_300 },
      { optionId: "option-b", name: "36-inch wreath", unit: "each", total: 298 },
      { optionId: "option-b", name: "Lifetime warranty", unit: "included", total: 0 },
    ],
    customer: {
      name: "Jordan Sample",
      email: "jordan@example.com",
      phone: "801-555-0147",
    },
    property: { address: "124 Maple Lane", city: "Orem", state: "UT", zip: "84057" },
    createdAt: "2026-10-22T12:00:00.000Z",
    effectiveAt: "2026-11-06T12:00:00.000Z",
    promotionalPhotoConsent: false,
  });

  assert.equal(agreement.customerName, "Jordan Sample");
  assert.equal(agreement.propertyAddress, "124 Maple Lane, Orem, UT, 84057");
  assert.equal(agreement.scopeDesignPackage, "Roofline, 36-inch wreath");
  assert.equal(agreement.annualSubscriptionFee, 1_598);
  assert.equal(agreement.bookingDeposit, 799);
  assert.equal(agreement.installationPayment, 799);
  assert.equal(agreement.cancellationFee, 812.5);
  assert.equal(agreement.materials[0]?.manufacturerModel, "");
  assert.equal(agreement.materials.reduce((sum, item) => sum + item.totalMsrp, 0), 812.5);
  assert.equal(agreement.promotionalPhotoConsent, false);
});

test("legacy flat cancellation costs still produce a materials-list row", () => {
  const agreement = buildHolidaySubscriptionAgreement({
    selectedOptionId: "legacy",
    optionLabel: "Yearly Service",
    optionTotal: 600,
    optionMetadata: { cancellationFee: 325 },
  });

  assert.equal(agreement.materials.length, 1);
  assert.equal(agreement.materials[0]?.totalMsrp, 325);
});

test("permanent lighting is never treated as a seasonal subscription agreement", () => {
  assert.equal(
    isSeasonalHolidaySubscriptionOption({
      pricingMode: "permanent",
      recurringYearlyService: true,
    }),
    false
  );
  assert.equal(
    isSeasonalHolidaySubscriptionOption({ pricingMode: "buy", recurringYearlyService: true }),
    true
  );
});

