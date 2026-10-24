import test from "node:test";
import assert from "node:assert/strict";
import { websiteLeadFormLabel, websiteLeadNotificationTitle } from "./form-labels";

test("labels gift card quote leads clearly in the CRM inbox", () => {
  assert.equal(
    websiteLeadFormLabel("christmas-gift-card"),
    "$100 Christmas Lights Gift Card Quote",
  );
  assert.equal(
    websiteLeadNotificationTitle("christmas-gift-card", "Jordan Smith"),
    "$100 Christmas Lights Gift Card Quote: Jordan Smith",
  );
});
