import test from "node:test";
import assert from "node:assert/strict";
import { uniqueCampaignRecipientCount } from "../stats";

test("uniqueCampaignRecipientCount treats email + SMS to the same customer as one person", () => {
  assert.equal(
    uniqueCampaignRecipientCount([
      { id: "r1", customerId: "c1", email: "a@x.com", phone: "+15551111111" },
      { id: "r2", customerId: "c1", email: "a@x.com", phone: "+15551111111" },
    ]),
    1
  );
});

test("uniqueCampaignRecipientCount counts different customers separately", () => {
  assert.equal(
    uniqueCampaignRecipientCount([
      { id: "r1", customerId: "c1" },
      { id: "r2", customerId: "c2" },
    ]),
    2
  );
});

test("uniqueCampaignRecipientCount falls back to email or phone when customerId is missing", () => {
  assert.equal(
    uniqueCampaignRecipientCount([
      { id: "r1", customerId: null, email: "A@x.com" },
      { id: "r2", customerId: null, email: "a@x.com" },
    ]),
    1
  );
  assert.equal(
    uniqueCampaignRecipientCount([
      { id: "r1", customerId: null, phone: "+1 (555) 111-2222" },
      { id: "r2", customerId: null, phone: "5551112222" },
    ]),
    1
  );
});
