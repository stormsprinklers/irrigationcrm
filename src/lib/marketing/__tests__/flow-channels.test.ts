import assert from "node:assert/strict";
import test from "node:test";
import { campaignFlowChannels, unavailableCampaignChannelReason } from "../flow-channels";

test("mixed flows enroll contacts eligible for email or SMS", () => {
  assert.deepEqual(
    campaignFlowChannels([
      { type: "TRIGGER" },
      { type: "SEND_EMAIL" },
      { type: "WAIT" },
      { type: "SEND_SMS" },
      { type: "SEND_SMS" },
    ]),
    ["EMAIL", "SMS"]
  );
  assert.deepEqual(campaignFlowChannels([{ type: "SEND_SMS" }]), ["SMS"]);
});

test("a contact skips only the unavailable or opted-out channel", () => {
  const phoneOnly = { email: null, phone: "+18015551234" };
  assert.equal(unavailableCampaignChannelReason(phoneOnly, "EMAIL"), "missing_email");
  assert.equal(unavailableCampaignChannelReason(phoneOnly, "SMS"), null);

  const emailOnly = { email: "customer@example.com", phone: null };
  assert.equal(unavailableCampaignChannelReason(emailOnly, "EMAIL"), null);
  assert.equal(unavailableCampaignChannelReason(emailOnly, "SMS"), "missing_phone");

  assert.equal(
    unavailableCampaignChannelReason(
      { email: "customer@example.com", phone: "+18015551234", marketingSmsOptOut: true },
      "SMS"
    ),
    "sms_opted_out"
  );
});
