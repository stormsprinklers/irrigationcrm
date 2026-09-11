import test from "node:test";
import assert from "node:assert/strict";
import { shouldReopenRecurringTodo, sundayWeekStartKey } from "../todo-types";

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
