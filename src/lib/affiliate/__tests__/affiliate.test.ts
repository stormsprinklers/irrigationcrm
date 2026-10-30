import assert from "node:assert/strict";
import test from "node:test";
import { affiliatePathAllowed } from "../access.ts";
import { parseAffiliateCustomerPayload } from "../payload.ts";
import { generateIntegrationKey, hashIntegrationKey } from "../../integrations/keys.ts";

test("affiliate payload accepts documented snake-case fields", () => {
  const parsed = parseAffiliateCustomerPayload({
    first_name: "Jordan",
    last_name: "Smith",
    phone: "+18015551234",
    email: "Jordan@Example.com",
    address: "123 Main St",
    lead_source: "Partner site",
    notes: "Requested a quote",
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.firstName, "Jordan");
  assert.equal(parsed.data.lastName, "Smith");
  assert.equal(parsed.data.leadSource, "Partner site");
});

test("affiliate payload requires both customer names", () => {
  const parsed = parseAffiliateCustomerPayload({ first_name: "Jordan" });
  assert.equal(parsed.success, false);
});

test("affiliate route allowlist excludes staff CRM and staff APIs", () => {
  assert.equal(affiliatePathAllowed("/affiliate"), true);
  assert.equal(affiliatePathAllowed("/affiliate/pipeline"), true);
  assert.equal(affiliatePathAllowed("/api/affiliate/customers"), true);
  assert.equal(affiliatePathAllowed("/customers"), false);
  assert.equal(affiliatePathAllowed("/settings"), false);
  assert.equal(affiliatePathAllowed("/api/customers"), false);
  assert.equal(affiliatePathAllowed("/api/voice/calls/history"), false);
});

test("integration keys are stored as irreversible hashes", () => {
  const { rawKey, keyHash, keyPrefix } = generateIntegrationKey();
  assert.match(rawKey, /^crm_int_[a-f0-9]{64}$/);
  assert.equal(keyHash, hashIntegrationKey(rawKey));
  assert.notEqual(keyHash, rawKey);
  assert.equal(keyPrefix, rawKey.slice(0, 16));
});
