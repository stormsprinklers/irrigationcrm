import assert from "node:assert/strict";
import test from "node:test";
import {
  queueSidByFriendlyName,
  shouldOverflowDialToQueue,
} from "./call-queue";

test("a declined Radar invite queues only when Radar confirms an active call", () => {
  assert.equal(shouldOverflowDialToQueue("busy", false), false);
  assert.equal(shouldOverflowDialToQueue("busy", true), true);
  assert.equal(shouldOverflowDialToQueue("no-answer", true), true);
  assert.equal(shouldOverflowDialToQueue("failed", true), false);
  assert.equal(shouldOverflowDialToQueue("busy", true, true), false);
});

test("queue pickup resolves the Twilio SID from the friendly name", () => {
  const queues = [
    { sid: "QUother", friendlyName: "company_other" },
    { sid: "QUtarget", friendlyName: "company_target" },
  ];
  assert.equal(queueSidByFriendlyName(queues, "company_target"), "QUtarget");
  assert.equal(queueSidByFriendlyName(queues, "company_missing"), null);
});
