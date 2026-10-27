import test from "node:test";
import assert from "node:assert/strict";
import { captureWebsiteLeadFormFields, websiteLeadSchema } from "./schemas";

test("accepts the Christmas gift card landing-page payload", () => {
  const parsed = websiteLeadSchema.safeParse({
    externalId: "christmas-gift-card:00000000-0000-4000-8000-000000000000",
    name: "Jordan Smith",
    phone: "385-555-1234",
    email: null,
    source: "christmas-gift-card",
    address: "123 Main Street, Lehi, UT 84043",
    notes: [
      "$100 promotional Christmas lights gift card quote request",
      "Gift card given by: Taylor Smith",
      "Property address: 123 Main Street, Lehi, UT 84043",
      "Customer requested contact about a quote by call or text.",
    ].join("\n"),
    metadata: {
      form: "gift_card_quote",
      promotion: "100-dollar-gift-card",
      giftCardValue: 100,
      giftCardFrom: "Taylor Smith",
      conversion_page: "/gift-card",
      attribution: {},
      tracking: {},
    },
  });

  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.source, "christmas-gift-card");
    assert.equal(parsed.data.email, null);
    assert.equal(parsed.data.metadata?.giftCardValue, 100);
  }
});

test("preserves arbitrary webhook answers under metadata form fields", () => {
  const parsed = websiteLeadSchema.parse({
    externalId: "leadconnector:contact-123",
    name: "Jordan Smith",
    phone: "385-555-1234",
    source: "meta-instant",
    property_type: "Two story home",
    desired_timeline: "Within 30 days",
    metadata: { facebook_lead_id: "1485075230355177" },
  });
  const captured = captureWebsiteLeadFormFields(parsed);

  assert.deepEqual(captured.metadata?.form_fields, {
    property_type: "Two story home",
    desired_timeline: "Within 30 days",
  });
  assert.equal(captured.metadata?.facebook_lead_id, "1485075230355177");
});
