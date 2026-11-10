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

test("blocks an overlapping visit", () => {
  assert.deepEqual(
    classifyAssignmentAvailability({
      employeeName: "Alex Morgan",
      hasApprovedTimeOff: false,
      conflictingVisitTitle: "Sprinkler repair",
    }),
    {
      error:
        'Alex Morgan is already assigned to "Sprinkler repair" during this time. Choose a different time or technician.',
      warning: null,
    }
  );
});

test("prioritizes an overlap error over an off-schedule warning", () => {
  assert.deepEqual(
    classifyAssignmentAvailability({
      employeeName: "Alex Morgan",
      hasApprovedTimeOff: false,
      offScheduleWarning: "Alex Morgan is normally off at this time.",
      conflictingVisitTitle: "Sprinkler repair",
    }),
    {
      error:
        'Alex Morgan is already assigned to "Sprinkler repair" during this time. Choose a different time or technician.',
      warning: null,
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
