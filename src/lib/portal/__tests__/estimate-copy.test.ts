import test from "node:test";
import assert from "node:assert/strict";
import { customerEstimateDescription } from "../estimate-copy";
import { serializePortalEstimate } from "../serializers";

test("legacy internal holiday notes are removed from customer option copy", () => {
  assert.equal(customerEstimateDescription("Lease Lights\n\nGate code 1234\n\nInstallation and takedown included.", ["Gate code 1234", null]), "Lease Lights\n\nInstallation and takedown included.");
});

test("holiday lease options expose commitments and replace the legacy warranty", () => {
  const view = serializePortalEstimate({
    id: "estimate",
    publicToken: "token",
    status: "SENT",
    total: 900,
    subtotal: 1_000,
    discountTotal: 100,
    expiresAt: null,
    signedAt: null,
    signatureBlobUrl: null,
    createdAt: new Date(),
    designExportMetadata: {
      source: "holiday-lighting-quote",
      options: [
        {
          letter: "B",
          pricingMode: "lease",
          leaseContractYears: 3,
          leaseContractDiscountPercent: 10,
        },
      ],
    },
    options: [
      {
        id: "lease-option",
        letter: "B",
        label: "Lease Lights",
        description: "3-Year Agreement · Save 10% Each Year\n\nAnnual lease.",
        sortOrder: 0,
        subtotal: 1_000,
        discountTotal: 100,
        total: 900,
      },
    ],
    lineItems: [
      {
        optionId: "lease-option",
        name: "3-year parts and labor warranty",
        description: "Legacy copy",
        quantity: 1,
        unitPrice: 0,
        unit: "included",
        total: 0,
        sortOrder: 1,
      },
    ],
  });

  assert.equal(view.options[0].pricingMode, "lease");
  assert.equal(view.options[0].leaseContractYears, 3);
  assert.equal(view.lineItems[0].name, "Lifetime parts and labor warranty");
  assert.match(view.lineItems[0].description ?? "", /lease remains active/i);
});
test("customer authored presentation copy is preserved", () => {
  assert.equal(customerEstimateDescription("Roofline C9 bulbs", ["Call before arrival"]), "Roofline C9 bulbs");
});

test("customer approval uses the shared current deposit threshold", () => {
  const view = serializePortalEstimate({
    id: "estimate",
    publicToken: "token",
    status: "SENT",
    total: 500,
    subtotal: 500,
    discountTotal: 0,
    expiresAt: null,
    signedAt: null,
    signatureBlobUrl: null,
    createdAt: new Date(),
    depositRequired: true,
    depositType: "PERCENT",
    depositAmount: 50,
    depositThreshold: 999,
    lineItems: [],
    company: {
      estimateWarrantyText: null,
      deferredVisitDepositThreshold: 100,
    },
  });

  assert.equal(view.depositThreshold, 100);
});

test("public estimate normalizes private preview URLs and excludes internal notes", () => {
  const savedOrigin = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://crm.example";
  try {
    const preview = "https://test.private.blob.vercel-storage.com/company-holiday/company/design-preview.png";
    const view = serializePortalEstimate({
      id:"estimate",publicToken:"token",status:"SENT",total:100,subtotal:100,discountTotal:0,
      expiresAt:null,signedAt:null,signatureBlobUrl:null,createdAt:new Date(),
      customer:{name:"Taylor Customer",email:"taylor@example.com",phone:"801-555-0100"},
      property:{address:"100 Holly Way",city:"Orem",state:"UT",zip:"84057"},
      designExportMetadata:{source:"holiday-lighting-quote",recurringYearlyService:true,previewImageUrl:preview,notes:"Secret gate code",options:[{letter:"A",pricingMode:"buy",colorPattern:"Multicolor",notes:"Private staffing instructions",recurringYearlyService:true,cancellationFee:237.45,cancellationItems:[{id:"c9",name:"C9 bulbs",quantity:50,unitMsrp:4.749,total:237.45}]}]},
      options:[{id:"option",letter:"A",label:"Roofline",description:"Roofline lights\n\nCancel by paying the unmarked-up material cost\n\nSecret gate code\n\nPrivate staffing instructions",internalNotes:"Secret gate code",photoUrl:preview,sortOrder:0,subtotal:100,discountTotal:0,total:100}],
      lineItems:[{optionId:"option",name:"Roofline lighting",description:"C9 · Warm White · 100 ft",quantity:1,unitPrice:100,total:100,sortOrder:0}]
    }, "https://portal.chestnut.example");
    assert.equal(view.holidayPreviewImageUrl, view.options[0].photoUrl);
    assert.ok(view.holidayPreviewImageUrl?.startsWith("https://portal.chestnut.example/api/public/blob?"));
    assert.equal(view.options[0].description,"Roofline lights\n\nCancel by paying the material cost");
    assert.equal(view.lineItems[0].description,"C9 · Multicolor");
    assert.doesNotMatch(JSON.stringify(view), /\b(?:ft|feet|foot)\b/i);
    assert.doesNotMatch(JSON.stringify(view), /unmarked-up/i);
    assert.equal(view.options[0].cancellationFee, 237.45);
    assert.equal(view.holidayRecurringService, true);
    assert.equal(view.options[0].recurringYearlyService, true);
    assert.equal(view.options[0].subscriptionAgreement?.customerName, "Taylor Customer");
    assert.equal(view.options[0].subscriptionAgreement?.propertyAddress, "100 Holly Way, Orem, UT, 84057");
    assert.equal(view.options[0].subscriptionAgreement?.materials[0]?.manufacturerModel, "");
    assert.ok(!JSON.stringify(view).includes("Secret gate code"));
    assert.ok(!JSON.stringify(view).includes("Private staffing instructions"));
  } finally {
    if (savedOrigin === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = savedOrigin;
  }
});

test("permanent lighting never exposes seasonal recurring terms or a cancellation fee", () => {
  const view = serializePortalEstimate({
    id: "estimate",
    publicToken: "token",
    status: "SENT",
    total: 2_500,
    subtotal: 2_500,
    discountTotal: 0,
    expiresAt: null,
    signedAt: null,
    signatureBlobUrl: null,
    createdAt: new Date(),
    designExportMetadata: {
      source: "holiday-lighting-quote",
      recurringYearlyService: true,
      options: [{
        letter: "A",
        pricingMode: "permanent",
        recurringYearlyService: true,
        cancellationFee: 900,
      }],
    },
    options: [{
      id: "permanent-option",
      letter: "A",
      label: "Permanent Holiday Lighting Service",
      description:
        "Yearly recurring service · Cancel by paying the unmarked-up material cost\n\nA complete permanent holiday lighting service with company-provided materials, professional installation, maintenance, and a lifetime warranty.",
      sortOrder: 0,
      subtotal: 2_500,
      discountTotal: 0,
      total: 2_500,
    }],
    lineItems: [
      {
        optionId: "permanent-option",
        name: "Permanent Holiday Lighting Service",
        description: "Yearly recurring service · Cancel by paying the unmarked-up material cost",
        quantity: 1,
        unitPrice: 2_500,
        unit: "each",
        total: 2_500,
        sortOrder: 0,
      },
      {
        optionId: "permanent-option",
        name: "Professional installation",
        description: "Custom-fit holiday lighting installation is included.",
        quantity: 1,
        unitPrice: 0,
        unit: "included",
        total: 0,
        sortOrder: 1,
      },
    ],
  });

  assert.equal(view.options[0]?.recurringYearlyService, false);
  assert.equal(view.options[0]?.cancellationFee, 0);
  assert.equal(view.options[0]?.subscriptionAgreement, null);
  assert.equal(view.options[0]?.label, "Permanent Holiday Lighting Installation");
  assert.doesNotMatch(view.options[0]?.description ?? "", /recurring|cancellation fee/i);
  assert.match(view.options[0]?.description ?? "", /one-time permanent/i);
  assert.equal(view.lineItems[0]?.name, "Permanent Holiday Lighting Installation");
  assert.doesNotMatch(view.lineItems[0]?.description ?? "", /recurring|cancel/i);
  assert.equal(view.lineItems.some((line) => line.name === "Professional installation"), false);
});
