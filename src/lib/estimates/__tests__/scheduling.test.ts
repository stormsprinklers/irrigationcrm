import assert from "node:assert/strict";
import test from "node:test";
import { VisitStatus } from "@prisma/client";
import { visitCountsAsScheduled } from "../scheduling";

test("scheduled and active visits clear the needs-scheduling queue", () => {
  for (const status of [
    VisitStatus.SCHEDULED,
    VisitStatus.EN_ROUTE,
    VisitStatus.IN_PROGRESS,
    VisitStatus.PAUSED,
    VisitStatus.COMPLETED,
  ]) {
    assert.equal(visitCountsAsScheduled(status), true);
  }
});

test("unscheduled and cancelled visits remain in the needs-scheduling queue", () => {
  assert.equal(visitCountsAsScheduled(VisitStatus.UNSCHEDULED), false);
  assert.equal(visitCountsAsScheduled(VisitStatus.CANCELLED), false);
});
