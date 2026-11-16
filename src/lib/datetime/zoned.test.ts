import assert from "node:assert/strict";
import test from "node:test";
import {
  getZonedParts,
  instantToLocalWallDate,
  zonedDateTimeInputValue,
  zonedWallTimeInputToUtc,
} from "./zoned";
import { formatTimeInTimezone } from "@/lib/notifications/timezone";

const COMPANY_TIME_ZONE = "America/Denver";

test("company wall time is independent of the CSR browser timezone", () => {
  const instant = zonedWallTimeInputToUtc("2026-11-20T09:30", COMPANY_TIME_ZONE);
  assert.equal(instant.toISOString(), "2026-11-20T16:30:00.000Z");
  assert.equal(formatTimeInTimezone(instant, COMPANY_TIME_ZONE), "9:30 AM");
  assert.deepEqual(
    getZonedParts(instant, COMPANY_TIME_ZONE),
    {
      year: 2026,
      month: 11,
      day: 20,
      hour: 9,
      minute: 30,
      second: 0,
      weekday: "Fri",
    }
  );
});

test("stored instants populate company-local scheduling inputs", () => {
  assert.equal(
    zonedDateTimeInputValue("2026-11-20T16:30:00.000Z", COMPANY_TIME_ZONE),
    "2026-11-20T09:30"
  );
});

test("schedule display dates preserve company wall-clock fields", () => {
  const display = instantToLocalWallDate("2026-11-20T16:30:00.000Z", COMPANY_TIME_ZONE);
  assert.equal(display.getFullYear(), 2026);
  assert.equal(display.getMonth(), 10);
  assert.equal(display.getDate(), 20);
  assert.equal(display.getHours(), 9);
  assert.equal(display.getMinutes(), 30);
});

test("nonexistent DST wall times are rejected", () => {
  const instant = zonedWallTimeInputToUtc("2026-03-08T02:30", COMPANY_TIME_ZONE);
  assert.equal(Number.isNaN(instant.getTime()), true);
});
