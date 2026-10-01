import test from "node:test";
import assert from "node:assert/strict";
import {
  estimateSentActivityStatus,
  parseEstimateSentActivity,
} from "../internal-activity";

test("estimate activity status round-trips the estimate id", () => {
  const status = estimateSentActivityStatus("estimate_123");
  assert.equal(status, "internal_note:estimate:estimate_123");
  assert.deepEqual(parseEstimateSentActivity(status), { estimateId: "estimate_123" });
});

test("ordinary Twilio delivery statuses are not internal estimate activities", () => {
  assert.equal(parseEstimateSentActivity("delivered"), null);
  assert.equal(parseEstimateSentActivity(null), null);
});
