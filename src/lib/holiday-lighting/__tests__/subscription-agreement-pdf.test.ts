import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { buildHolidaySubscriptionAgreementPdf } from "../subscription-agreement-pdf";
import type { HolidaySubscriptionAgreementData } from "../subscription-agreement";

const agreement: HolidaySubscriptionAgreementData = {
  version: "2026-11-06",
  estimateNumber: "EST-2041",
  selectedOptionId: "option-b",
  customerName: "Jordan Sample",
  propertyAddress: "124 Maple Lane, Orem, UT 84057",
  emailPhone: "jordan@example.com / 801-555-0147",
  effectiveDate: "November 6, 2026",
  scopeDesignPackage: "Roofline, 36-inch wreath",
  targetInstallationWindow: "November 20, 2026",
  targetTakedownWindow: "Approximately January 15",
  annualSubscriptionFee: 1_598,
  bookingDeposit: 799,
  installationPayment: 799,
  paymentMethodOnFile: "Card required at approval",
  promotionalPhotoConsent: true,
  cancellationFee: 812.5,
  materials: [
    {
      id: "bulbs",
      itemDescription: "C9 LED bulbs",
      manufacturerModel: "Commercial grade",
      quantity: 125,
      unitMsrp: 4.5,
      totalMsrp: 562.5,
      dateAdded: "October 22, 2026",
    },
  ],
};

test("signed holiday subscription PDF contains agreement, exhibits, and signature image", async () => {
  const signatureImage = await sharp({
    create: { width: 400, height: 120, channels: 4, background: "white" },
  })
    .png()
    .toBuffer();
  const pdf = await buildHolidaySubscriptionAgreementPdf({
    agreement,
    signatureImage,
    signedAt: new Date("2026-11-06T18:30:00.000Z"),
  });
  const text = pdf.toString("latin1");

  assert.equal(text.startsWith("%PDF-1.4"), true);
  assert.match(text, /Seasonal Holiday Lighting Subscription Agreement/);
  assert.match(text, /Exhibit A/);
  assert.match(text, /Exhibit B/);
  assert.match(text, /Electronic Signature/);
  assert.match(text, /Customer signature/);
  assert.match(text, /\/Subtype \/Image/);
});
