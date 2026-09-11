import test from "node:test";
import assert from "node:assert/strict";
import { isGbpReviewPullHour } from "../review-pull-window";

test("4pm MDT (Sep) is the pull hour", () => {
  assert.equal(isGbpReviewPullHour(new Date("2026-09-11T22:00:00.000Z")), true);
});

test("5pm MDT is not the pull hour", () => {
  assert.equal(isGbpReviewPullHour(new Date("2026-09-11T23:00:00.000Z")), false);
});

test("4pm MST (Jan) is the pull hour", () => {
  assert.equal(isGbpReviewPullHour(new Date("2026-01-15T23:00:00.000Z")), true);
});

test("3pm MST is not the pull hour", () => {
  assert.equal(isGbpReviewPullHour(new Date("2026-01-15T22:00:00.000Z")), false);
});
