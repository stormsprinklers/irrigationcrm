import assert from "node:assert/strict";
import test from "node:test";
import { classifyAssignmentAvailability } from "@/lib/schedule/time-off";

test("keeps approved time off as a blocking assignment error", () => {
  assert.deepEqual(
    classifyAssignmentAvailability({
      employeeName: "Alex Morgan",
      hasApprovedTimeOff: true,
      conflictingVisitTitle: "Sprinkler repair",
    }),
    {
      error: "Alex Morgan has approved time off during this period",
      warning: null,
    }
  );
});

test("warns but allows an overlapping visit", () => {
  assert.deepEqual(
    classifyAssignmentAvailability({
      employeeName: "Alex Morgan",
      hasApprovedTimeOff: false,
      conflictingVisitTitle: "Sprinkler repair",
    }),
    {
      error: null,
      warning:
        'Alex Morgan is already assigned to "Sprinkler repair" during this time. This technician will be double-booked.',
    }
  );
});

test("combines overlap and off-schedule warnings", () => {
  assert.deepEqual(
    classifyAssignmentAvailability({
      employeeName: "Alex Morgan",
      hasApprovedTimeOff: false,
      offScheduleWarning: "Alex Morgan is normally off at this time.",
      conflictingVisitTitle: "Sprinkler repair",
    }),
    {
      error: null,
      warning:
        'Alex Morgan is already assigned to "Sprinkler repair" during this time. This technician will be double-booked. Alex Morgan is normally off at this time.',
    }
  );
});

test("returns no warning when the assignment is available", () => {
  assert.deepEqual(
    classifyAssignmentAvailability({
      employeeName: "Alex Morgan",
      hasApprovedTimeOff: false,
    }),
    { error: null, warning: null }
  );
});
