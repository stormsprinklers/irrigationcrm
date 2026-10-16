import assert from "node:assert/strict";
import test from "node:test";
import { validateOwnerAssistantVisitTime } from "../visit-time";

const now = new Date("2026-10-16T18:00:00.000Z");

test("rejects a past owner-assistant appointment", () => {
  const result = validateOwnerAssistantVisitTime(
    "2023-11-21T09:00:00-07:00",
    "2023-11-21T10:00:00-07:00",
    now
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "PAST_DATE");
});

test("requires an explicit timezone", () => {
  const result = validateOwnerAssistantVisitTime(
    "2026-11-21T09:00:00",
    "2026-11-21T10:00:00",
    now
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "TIMEZONE_REQUIRED");
});

test("accepts a future appointment with an explicit offset", () => {
  const result = validateOwnerAssistantVisitTime(
    "2026-11-21T09:00:00-07:00",
    "2026-11-21T10:00:00-07:00",
    now
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.startAt.toISOString(), "2026-11-21T16:00:00.000Z");
    assert.equal(result.endAt.toISOString(), "2026-11-21T17:00:00.000Z");
  }
});
