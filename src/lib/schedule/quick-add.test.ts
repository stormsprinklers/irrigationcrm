import assert from "node:assert/strict";
import test from "node:test";
import { snapScheduleSlot } from "./quick-add";

test("schedule selections snap to 15-minute increments", () => {
  const day = new Date(2026, 10, 4);
  const hourHeight = 60;
  const slot = snapScheduleSlot(day, 8, hourHeight, 6, 20, 2);

  assert.equal(slot.startAt.getHours(), 6);
  assert.equal(slot.startAt.getMinutes(), 15);
  assert.equal(slot.endAt.getHours(), 8);
  assert.equal(slot.endAt.getMinutes(), 15);
});
