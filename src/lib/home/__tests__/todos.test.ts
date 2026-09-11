import test from "node:test";
import assert from "node:assert/strict";
import {
  officeTodoRecurrenceFormValues,
  officeTodoRecurrenceLabel,
  parseOfficeTodoRecurrence,
  shouldReopenRecurringTodo,
  sundayWeekStartKey,
} from "../todo-types";

test("daily todos reopen on the next local day", () => {
  assert.equal(
    shouldReopenRecurringTodo({
      recurrence: "DAILY",
      completedAt: new Date("2026-09-10T18:00:00.000Z"),
      timezone: "America/Denver",
      now: new Date("2026-09-11T16:00:00.000Z"),
    }),
    true
  );
  assert.equal(
    shouldReopenRecurringTodo({
      recurrence: "DAILY",
      completedAt: new Date("2026-09-11T15:00:00.000Z"),
      timezone: "America/Denver",
      now: new Date("2026-09-11T20:00:00.000Z"),
    }),
    false
  );
});

test("weekly todos reopen after Sunday week rollover", () => {
  assert.equal(sundayWeekStartKey("2026-09-11", 5), "2026-09-06");
  assert.equal(
    shouldReopenRecurringTodo({
      recurrence: "WEEKLY",
      completedAt: new Date("2026-09-08T18:00:00.000Z"),
      timezone: "America/Denver",
      now: new Date("2026-09-14T16:00:00.000Z"),
    }),
    true
  );
  assert.equal(
    shouldReopenRecurringTodo({
      recurrence: "WEEKLY",
      completedAt: new Date("2026-09-08T18:00:00.000Z"),
      timezone: "America/Denver",
      now: new Date("2026-09-11T16:00:00.000Z"),
    }),
    false
  );
});

test("every N days waits the full interval after completion", () => {
  assert.equal(
    shouldReopenRecurringTodo({
      recurrence: "EVERY_N_DAYS",
      recurrenceEvery: 3,
      completedAt: new Date("2026-09-11T18:00:00.000Z"),
      timezone: "America/Denver",
      now: new Date("2026-09-13T16:00:00.000Z"),
    }),
    false
  );
  assert.equal(
    shouldReopenRecurringTodo({
      recurrence: "EVERY_N_DAYS",
      recurrenceEvery: 3,
      completedAt: new Date("2026-09-11T18:00:00.000Z"),
      timezone: "America/Denver",
      now: new Date("2026-09-14T16:00:00.000Z"),
    }),
    true
  );
});

test("weekly on a weekday reopens on that day", () => {
  // Friday Sep 11: most recent Monday is Sep 7. Completed Sep 8 stays done.
  assert.equal(
    shouldReopenRecurringTodo({
      recurrence: "WEEKLY_ON_DAY",
      recurrenceEvery: 1,
      completedAt: new Date("2026-09-08T18:00:00.000Z"),
      timezone: "America/Denver",
      now: new Date("2026-09-11T16:00:00.000Z"),
    }),
    false
  );
  // Monday Sep 14: due is Sep 14. Completed Sep 8 reopens.
  assert.equal(
    shouldReopenRecurringTodo({
      recurrence: "WEEKLY_ON_DAY",
      recurrenceEvery: 1,
      completedAt: new Date("2026-09-08T18:00:00.000Z"),
      timezone: "America/Denver",
      now: new Date("2026-09-14T16:00:00.000Z"),
    }),
    true
  );
  // Monday Sep 14, already completed that morning, stays done.
  assert.equal(
    shouldReopenRecurringTodo({
      recurrence: "WEEKLY_ON_DAY",
      recurrenceEvery: 1,
      completedAt: new Date("2026-09-14T15:00:00.000Z"),
      timezone: "America/Denver",
      now: new Date("2026-09-14T20:00:00.000Z"),
    }),
    false
  );
});

test("monthly on a day reopens on or after that date next month", () => {
  assert.equal(
    shouldReopenRecurringTodo({
      recurrence: "MONTHLY_ON_DAY",
      recurrenceEvery: 15,
      completedAt: new Date("2026-08-15T18:00:00.000Z"),
      timezone: "America/Denver",
      now: new Date("2026-09-11T16:00:00.000Z"),
    }),
    false
  );
  assert.equal(
    shouldReopenRecurringTodo({
      recurrence: "MONTHLY_ON_DAY",
      recurrenceEvery: 15,
      completedAt: new Date("2026-08-15T18:00:00.000Z"),
      timezone: "America/Denver",
      now: new Date("2026-09-15T16:00:00.000Z"),
    }),
    true
  );
  assert.equal(
    shouldReopenRecurringTodo({
      recurrence: "MONTHLY_ON_DAY",
      recurrenceEvery: 15,
      completedAt: new Date("2026-09-15T18:00:00.000Z"),
      timezone: "America/Denver",
      now: new Date("2026-09-20T16:00:00.000Z"),
    }),
    false
  );
});

test("monthly on the 31st uses the last day of shorter months", () => {
  assert.equal(
    shouldReopenRecurringTodo({
      recurrence: "MONTHLY_ON_DAY",
      recurrenceEvery: 31,
      completedAt: new Date("2026-01-31T18:00:00.000Z"),
      timezone: "America/Denver",
      now: new Date("2026-02-28T16:00:00.000Z"),
    }),
    true
  );
});

test("one-time todos never reopen", () => {
  assert.equal(
    shouldReopenRecurringTodo({
      recurrence: "NONE",
      completedAt: new Date("2026-01-01T00:00:00.000Z"),
      timezone: "America/Denver",
      now: new Date("2026-09-11T16:00:00.000Z"),
    }),
    false
  );
});

test("parseOfficeTodoRecurrence clamps custom values", () => {
  assert.deepEqual(parseOfficeTodoRecurrence("EVERY_N_DAYS", 3), {
    recurrence: "EVERY_N_DAYS",
    recurrenceEvery: 3,
  });
  assert.deepEqual(parseOfficeTodoRecurrence("WEEKLY_ON_DAY", 0), {
    recurrence: "WEEKLY_ON_DAY",
    recurrenceEvery: 0,
  });
  assert.deepEqual(parseOfficeTodoRecurrence("MONTHLY_ON_DAY", 40), {
    recurrence: "MONTHLY_ON_DAY",
    recurrenceEvery: 31,
  });
  assert.deepEqual(parseOfficeTodoRecurrence("DAILY"), {
    recurrence: "DAILY",
    recurrenceEvery: null,
  });
});

test("officeTodoRecurrenceLabel describes custom schedules", () => {
  assert.equal(officeTodoRecurrenceLabel("EVERY_N_DAYS", 3), "Every 3 days");
  assert.equal(officeTodoRecurrenceLabel("WEEKLY_ON_DAY", 1), "Every Monday");
  assert.equal(officeTodoRecurrenceLabel("MONTHLY_ON_DAY", 15), "Every 15th of the month");
});

test("daily tasks edit as every 1 day", () => {
  assert.deepEqual(
    officeTodoRecurrenceFormValues({ recurrence: "DAILY", recurrenceEvery: null }),
    { recurrence: "EVERY_N_DAYS", recurrenceEvery: 1 }
  );
});
