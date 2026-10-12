import test from "node:test";
import assert from "node:assert/strict";
import {
  hasRecentSmsActivity,
  mergedSmsOpenState,
  smsOpenActivityCutoff,
} from "../sms-inbox-state";

const now = new Date("2026-10-12T18:00:00.000Z");

test("SMS activity is recent only inside the ten-day window", () => {
  assert.equal(hasRecentSmsActivity(new Date("2026-10-03T18:00:00.000Z"), now), true);
  assert.equal(hasRecentSmsActivity(smsOpenActivityCutoff(now), now), false);
  assert.equal(hasRecentSmsActivity(new Date("2026-10-01T18:00:00.000Z"), now), false);
});

test("stale duplicate conversations merge into General even if one was Open", () => {
  assert.equal(
    mergedSmsOpenState(
      [
        { smsOpen: true, lastMessageAt: new Date("2026-09-20T18:00:00.000Z") },
        { smsOpen: false, lastMessageAt: new Date("2026-09-22T18:00:00.000Z") },
      ],
      now
    ),
    false
  );
});

test("recent duplicate conversations retain their explicit Open state", () => {
  assert.equal(
    mergedSmsOpenState(
      [
        { smsOpen: false, lastMessageAt: new Date("2026-10-10T18:00:00.000Z") },
        { smsOpen: true, lastMessageAt: new Date("2026-10-11T18:00:00.000Z") },
      ],
      now
    ),
    true
  );
});
