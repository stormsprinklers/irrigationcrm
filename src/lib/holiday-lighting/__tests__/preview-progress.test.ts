import test from "node:test";
import assert from "node:assert/strict";
import { estimatePreviewGenerationProgress } from "../preview-progress";

test("preview progress starts visibly and increases with elapsed time", () => {
  const initial = estimatePreviewGenerationProgress({
    elapsedMs: 0,
    totalItems: 1,
    completedItems: 0,
  });
  const later = estimatePreviewGenerationProgress({
    elapsedMs: 45_000,
    totalItems: 1,
    completedItems: 0,
  });

  assert.equal(initial, 0.04);
  assert.ok(later > initial);
});

test("preview progress reflects finished jobs but waits for a confirmed completion", () => {
  const nearlyDone = estimatePreviewGenerationProgress({
    elapsedMs: 10 * 60_000,
    totalItems: 3,
    completedItems: 3,
  });

  assert.equal(nearlyDone, 0.94);
  assert.ok(nearlyDone < 1);
});

test("additional batches receive a longer time estimate", () => {
  const oneBatch = estimatePreviewGenerationProgress({
    elapsedMs: 60_000,
    totalItems: 3,
    completedItems: 0,
  });
  const twoBatches = estimatePreviewGenerationProgress({
    elapsedMs: 60_000,
    totalItems: 4,
    completedItems: 0,
  });

  assert.ok(oneBatch > twoBatches);
});
