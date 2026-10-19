import assert from "node:assert/strict";
import test from "node:test";
import { formatOwnerAssistantAppointment } from "../appointment-label";

test("formats the authoritative weekday in the company timezone", () => {
  const result = formatOwnerAssistantAppointment(
    new Date("2026-10-21T15:00:00.000Z"),
    new Date("2026-10-21T16:00:00.000Z"),
    "America/Denver"
  );

  assert.match(result.savedLocalStart, /^Wednesday, October 21, 2026/);
  assert.doesNotMatch(result.savedLocalStart, /Saturday/);
  assert.equal(result.companyTimeZone, "America/Denver");
});

test("falls back to UTC when a stored timezone is invalid", () => {
  const result = formatOwnerAssistantAppointment(
    new Date("2026-10-21T15:00:00.000Z"),
    new Date("2026-10-21T16:00:00.000Z"),
    "not/a-timezone"
  );

  assert.equal(result.companyTimeZone, "UTC");
  assert.match(result.savedLocalStart, /^Wednesday, October 21, 2026/);
});
