import test from "node:test";
import assert from "node:assert/strict";
import { websiteLeadSchema } from "./schemas";

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
