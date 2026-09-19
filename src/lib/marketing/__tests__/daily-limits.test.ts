import assert from "node:assert/strict";
import test from "node:test";
import { campaignDailySentWhere, isInitialChannelOutreachNode } from "../daily-limits";

test("daily campaign limits count email and SMS independently", () => {
  const startOfDay = new Date("2026-09-19T06:00:00.000Z");
  const email = campaignDailySentWhere({
    campaignId: "campaign-1",
    channel: "EMAIL",
    flowNodeId: "first-email",
    startOfDay,
  });
  const sms = campaignDailySentWhere({
    campaignId: "campaign-1",
    channel: "SMS",
    flowNodeId: "first-sms",
    startOfDay,
  });

  assert.equal(email.channel, "EMAIL");
  assert.equal(email.flowNodeId, "first-email");
  assert.equal(sms.channel, "SMS");
  assert.equal(sms.flowNodeId, "first-sms");
  assert.deepEqual(email.sentAt, { gte: startOfDay });
  assert.deepEqual(email.status, { in: ["sent", "delivered"] });
});

test("only the first outreach node for each channel uses the daily allowance", () => {
  const nodes = [
    { id: "email-1", type: "SEND_EMAIL" },
    { id: "sms-1", type: "SEND_SMS" },
    { id: "reply-sms", type: "SEND_SMS" },
    { id: "follow-up-email", type: "SEND_EMAIL" },
  ];

  assert.equal(isInitialChannelOutreachNode(nodes, "email-1", "EMAIL"), true);
  assert.equal(isInitialChannelOutreachNode(nodes, "sms-1", "SMS"), true);
  assert.equal(isInitialChannelOutreachNode(nodes, "reply-sms", "SMS"), false);
  assert.equal(isInitialChannelOutreachNode(nodes, "follow-up-email", "EMAIL"), false);
});
