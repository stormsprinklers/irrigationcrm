import test from "node:test";
import assert from "node:assert/strict";
import {
  assignmentOffMessage,
  defaultEmployeeWorkSchedule,
  offWindowsForDay,
  isWorkingOnDay,
} from "../open-time-slots";

const weekendOff = defaultEmployeeWorkSchedule();

test("default schedule is off on Sunday and Saturday", () => {
  assert.equal(isWorkingOnDay(weekendOff, 0), false);
  assert.equal(isWorkingOnDay(weekendOff, 6), false);
  assert.equal(isWorkingOnDay(weekendOff, 1), true);
});

test("offWindowsForDay covers the full grid on a non-working day", () => {
  assert.deepEqual(offWindowsForDay(weekendOff, 0), [{ start: "04:00", end: "23:00" }]);
});

test("offWindowsForDay marks hours outside weekday work time as OFF", () => {
  assert.deepEqual(offWindowsForDay(weekendOff, 2), [
    { start: "04:00", end: "08:00" },
    { start: "16:00", end: "23:00" },
  ]);
});

test("offWindowsForDay is empty when work hours cover the grid", () => {
  const allDay = defaultEmployeeWorkSchedule().map((day) =>
    day.dayOfWeek === 3
      ? { ...day, isWorking: true, startTime: "04:00", endTime: "23:00" }
      : day
  );
  assert.deepEqual(offWindowsForDay(allDay, 3), []);
});

test("assignmentOffMessage blocks off days and hours outside the window", () => {
  assert.equal(assignmentOffMessage("Mike", weekendOff, 0, 9 * 60, 12 * 60), "Mike is off this day");
  assert.equal(
    assignmentOffMessage("Mike", weekendOff, 1, 15 * 60, 18 * 60),
    "Mike is only working 08:00–16:00 this day"
  );
  assert.equal(assignmentOffMessage("Mike", weekendOff, 1, 9 * 60, 12 * 60), null);
});
