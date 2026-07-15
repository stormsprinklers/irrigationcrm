import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSparseLeadFillPatch,
  isSparseLead,
} from "../merge-integration-lead";
import {
  normalizeOptionalLeadEmail,
  websiteLeadSchema,
} from "../../integrations/schemas";

test("isSparseLead is true when phone, email, and notes are empty", () => {
  assert.equal(isSparseLead({ phone: null, email: null, notes: null }), true);
  assert.equal(isSparseLead({ phone: "  ", email: "", notes: null }), true);
  assert.equal(
    isSparseLead({ phone: "8015551212", email: null, notes: null }),
    false
  );
});

test("buildSparseLeadFillPatch only fills empty fields", () => {
  const patch = buildSparseLeadFillPatch(
    {
      name: "Unknown",
      phone: null,
      email: "keep@example.com",
      notes: null,
      source: "contact",
      metadata: { landing_page: "/contact" },
    },
    {
      externalId: "web-1",
      name: "Jane Doe",
      phone: "8015559999",
      email: "new@example.com",
      source: "contact",
      notes: "Need a tune-up",
      metadata: { utm_source: "google", landing_page: "/pricing" },
    },
    "Need a tune-up",
    { utm_source: "google", landing_page: "/pricing" }
  );

  assert.equal(patch.phone, "8015559999");
  assert.equal(patch.name, "Jane Doe");
  assert.equal(patch.notes, "Need a tune-up");
  // Existing email must not be overwritten
  assert.equal(patch.email, undefined);
  assert.deepEqual(patch.metadata, {
    utm_source: "google",
    landing_page: "/contact",
  });
});

test("normalizeOptionalLeadEmail drops placeholders and invalid emails", () => {
  assert.equal(normalizeOptionalLeadEmail(""), null);
  assert.equal(normalizeOptionalLeadEmail("n/a"), null);
  assert.equal(normalizeOptionalLeadEmail("not-an-email"), null);
  assert.equal(normalizeOptionalLeadEmail("  jane@example.com "), "jane@example.com");
});

test("websiteLeadSchema accepts leads with invalid email by clearing it", () => {
  const parsed = websiteLeadSchema.safeParse({
    externalId: "form-1",
    name: "Pat",
    phone: "8015550000",
    email: "not-valid",
    source: "contact",
    notes: "Hello",
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.email, null);
    assert.equal(parsed.data.phone, "8015550000");
  }
});

test("websiteLeadSchema still requires externalId and name", () => {
  const parsed = websiteLeadSchema.safeParse({
    name: "Pat",
    phone: "8015550000",
  });
  assert.equal(parsed.success, false);
});
