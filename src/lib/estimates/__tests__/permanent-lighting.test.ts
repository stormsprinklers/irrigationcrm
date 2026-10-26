import assert from "node:assert/strict";
import test from "node:test";
import { hasPermanentLightingOption } from "../permanent-lighting";

test("identifies permanent lighting from its serialized pricing mode", () => {
  assert.equal(
    hasPermanentLightingOption({ options: [{ label: "Year-round package", pricingMode: "permanent" }] }),
    true
  );
});

test("identifies permanent lighting from holiday estimate metadata", () => {
  assert.equal(
    hasPermanentLightingOption({
      designExportMetadata: { options: [{ pricingMode: "buy" }, { pricingMode: "permanent" }] },
    }),
    true
  );
});

test("does not offer permanent-light financing on seasonal or unrelated estimates", () => {
  assert.equal(
    hasPermanentLightingOption({
      options: [{ label: "Lease Lights", pricingMode: "lease" }],
      lineItems: [{ name: "Sprinkler repair" }],
    }),
    false
  );
});
