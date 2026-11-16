import assert from "node:assert/strict";
import test from "node:test";
import { validateTimesheetCorrection } from "./edit";
import {
  canEditTimesheets,
  canViewAllTimesheets,
  canViewTimesheetPayPreview,
} from "./permissions";

test("CSRs can review and correct employee timesheets without payroll access", () => {
  assert.equal(canViewAllTimesheets("CSR"), true);
  assert.equal(canEditTimesheets("CSR"), true);
  assert.equal(canViewTimesheetPayPreview("CSR"), false);
  assert.equal(canViewTimesheetPayPreview("MANAGER"), true);
});

test("timesheet correction requires clock-out after clock-in", () => {
  const now = new Date("2026-11-16T20:00:00.000Z");
  assert.equal(
    validateTimesheetCorrection(
      new Date("2026-11-16T18:00:00.000Z"),
      new Date("2026-11-16T17:00:00.000Z"),
      now
    ),
    "Clock-out time must be after clock-in time"
  );
});

test("timesheet correction accepts completed and in-progress shifts", () => {
  const now = new Date("2026-11-16T20:00:00.000Z");
  assert.equal(
    validateTimesheetCorrection(
      new Date("2026-11-16T16:00:00.000Z"),
      new Date("2026-11-16T19:00:00.000Z"),
      now
    ),
    null
  );
  assert.equal(
    validateTimesheetCorrection(new Date("2026-11-16T16:00:00.000Z"), null, now),
    null
  );
});

test("timesheet correction rejects future clock times", () => {
  const now = new Date("2026-11-16T20:00:00.000Z");
  assert.equal(
    validateTimesheetCorrection(new Date("2026-11-16T21:00:00.000Z"), null, now),
    "Clock-in time cannot be in the future"
  );
});
