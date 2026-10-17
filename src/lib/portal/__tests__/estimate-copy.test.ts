import test from "node:test";
import assert from "node:assert/strict";
import { customerEstimateDescription } from "../estimate-copy";

test("legacy internal holiday notes are removed from customer option copy", () => {
  assert.equal(customerEstimateDescription("Lease Lights\n\nGate code 1234\n\nInstallation and takedown included.", ["Gate code 1234", null]), "Lease Lights\n\nInstallation and takedown included.");
});
test("customer authored presentation copy is preserved", () => {
  assert.equal(customerEstimateDescription("Roofline C9 bulbs", ["Call before arrival"]), "Roofline C9 bulbs");
});

import { serializePortalEstimate } from "../serializers";
test("public estimate normalizes private preview URLs and excludes internal notes", () => {
  const savedOrigin = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://crm.example";
  try {
    const preview = "https://test.private.blob.vercel-storage.com/company-holiday/company/design-preview.png";
    const view = serializePortalEstimate({
      id:"estimate",publicToken:"token",status:"SENT",total:100,subtotal:100,discountTotal:0,
      expiresAt:null,signedAt:null,signatureBlobUrl:null,createdAt:new Date(),
      designExportMetadata:{source:"holiday-lighting-quote",previewImageUrl:preview,notes:"Secret gate code",options:[{notes:"Private staffing instructions"}]},
      options:[{id:"option",letter:"A",label:"Roofline",description:"Roofline lights\n\nSecret gate code\n\nPrivate staffing instructions",internalNotes:"Secret gate code",photoUrl:preview,sortOrder:0,subtotal:100,discountTotal:0,total:100}],
      lineItems:[]
    });
    assert.equal(view.holidayPreviewImageUrl, view.options[0].photoUrl);
    assert.ok(view.holidayPreviewImageUrl?.startsWith("https://crm.example/api/public/blob?"));
    assert.equal(view.options[0].description,"Roofline lights");
    assert.ok(!JSON.stringify(view).includes("Secret gate code"));
    assert.ok(!JSON.stringify(view).includes("Private staffing instructions"));
  } finally {
    if (savedOrigin === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = savedOrigin;
  }
});
