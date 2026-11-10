import assert from "node:assert/strict";
import test from "node:test";
import { assignScheduleLanes } from "@/lib/schedule/lane-layout";

function job(id: string, startAt: string, endAt: string) {
  return { id, startAt, endAt };
}

test("gives every visit in an overlapping cluster the same final lane count", () => {
  const layouts = assignScheduleLanes([
    job("early", "2026-11-12T07:15:00.000Z", "2026-11-12T09:15:00.000Z"),
    job("eight-a", "2026-11-12T08:00:00.000Z", "2026-11-12T10:00:00.000Z"),
    job("eight-b", "2026-11-12T08:00:00.000Z", "2026-11-12T09:00:00.000Z"),
  ]);

  assert.deepEqual(
    layouts.map(({ job: item, lane, laneCount }) => ({ id: item.id, lane, laneCount })),
    [
      { id: "early", lane: 0, laneCount: 3 },
      { id: "eight-a", lane: 1, laneCount: 3 },
      { id: "eight-b", lane: 2, laneCount: 3 },
    ]
  );
});

test("resets to full width after an overlap cluster ends", () => {
  const layouts = assignScheduleLanes([
    job("first", "2026-11-12T08:00:00.000Z", "2026-11-12T09:00:00.000Z"),
    job("overlap", "2026-11-12T08:30:00.000Z", "2026-11-12T09:30:00.000Z"),
    job("later", "2026-11-12T10:00:00.000Z", "2026-11-12T11:00:00.000Z"),
  ]);

  assert.deepEqual(layouts.map(({ laneCount }) => laneCount), [2, 2, 1]);
});

test("treats back-to-back visits as non-overlapping", () => {
  const layouts = assignScheduleLanes([
    job("first", "2026-11-12T08:00:00.000Z", "2026-11-12T09:00:00.000Z"),
    job("second", "2026-11-12T09:00:00.000Z", "2026-11-12T10:00:00.000Z"),
  ]);

  assert.deepEqual(layouts.map(({ lane, laneCount }) => ({ lane, laneCount })), [
    { lane: 0, laneCount: 1 },
    { lane: 0, laneCount: 1 },
  ]);
});
