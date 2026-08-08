import test from "node:test";
import assert from "node:assert/strict";
import {
  clampToAutomatedSendWindow,
  isWithinAutomatedSendWindow,
  nextAutomatedSendWindowStart,
} from "../send-window";

const TZ = "America/Denver";

test("isWithinAutomatedSendWindow allows 5am–8:59pm Mountain", () => {
  // 2026-06-24 5:00 AM MDT = 11:00 UTC
  assert.equal(
    isWithinAutomatedSendWindow(new Date("2026-06-24T11:00:00.000Z"), TZ),
    true
  );
  // 8:59 PM MDT = 02:59 UTC next day
  assert.equal(
    isWithinAutomatedSendWindow(new Date("2026-06-25T02:59:00.000Z"), TZ),
    true
  );
  // 9:00 PM MDT = 03:00 UTC
  assert.equal(
    isWithinAutomatedSendWindow(new Date("2026-06-25T03:00:00.000Z"), TZ),
    false
  );
  // 4:59 AM MDT = 10:59 UTC
  assert.equal(
    isWithinAutomatedSendWindow(new Date("2026-06-24T10:59:00.000Z"), TZ),
    false
  );
});

test("nextAutomatedSendWindowStart holds overnight until 5am", () => {
  // 10:00 PM MDT Jun 24 → 5:00 AM Jun 25
  const at = new Date("2026-06-25T04:00:00.000Z");
  const next = nextAutomatedSendWindowStart(at, TZ);
  assert.equal(next.toISOString(), "2026-06-25T11:00:00.000Z");
});

test("nextAutomatedSendWindowStart from early morning is same-day 5am", () => {
  // 2:00 AM MDT Jun 24 → 5:00 AM jun 24
  const at = new Date("2026-06-24T08:00:00.000Z");
  const next = nextAutomatedSendWindowStart(at, TZ);
  assert.equal(next.toISOString(), "2026-06-24T11:00:00.000Z");
});

test("clampToAutomatedSendWindow leaves daytime unchanged", () => {
  const at = new Date("2026-06-24T18:00:00.000Z"); // noon MDT
  assert.equal(clampToAutomatedSendWindow(at, TZ).toISOString(), at.toISOString());
});
