const INITIAL_PROGRESS = 0.04;
const MAX_ESTIMATED_PROGRESS = 0.94;
const EXPECTED_BATCH_DURATION_MS = 45_000;
const CONCURRENT_PREVIEW_LIMIT = 3;

type PreviewProgressInput = {
  elapsedMs: number;
  totalItems: number;
  completedItems: number;
};

/**
 * Returns an intentionally conservative, time-based estimate for image generation.
 * It never reaches 100% until the server responses have been saved successfully.
 */
export function estimatePreviewGenerationProgress({
  elapsedMs,
  totalItems,
  completedItems,
}: PreviewProgressInput) {
  const safeTotal = Math.max(1, Math.floor(totalItems));
  const safeCompleted = Math.min(safeTotal, Math.max(0, Math.floor(completedItems)));
  const batchCount = Math.ceil(safeTotal / CONCURRENT_PREVIEW_LIMIT);
  const expectedDurationMs = batchCount * EXPECTED_BATCH_DURATION_MS;
  const elapsedRatio = Math.max(0, elapsedMs) / expectedDurationMs;

  // The easing curve moves quickly at first, then slows down near the end so
  // slower OpenAI image jobs never make the ring falsely look complete.
  const timeEstimate =
    INITIAL_PROGRESS +
    (MAX_ESTIMATED_PROGRESS - INITIAL_PROGRESS) *
      (1 - Math.exp(-elapsedRatio * 1.35));
  const completedFloor = INITIAL_PROGRESS +
    (MAX_ESTIMATED_PROGRESS - INITIAL_PROGRESS) * (safeCompleted / safeTotal);

  return Math.min(
    MAX_ESTIMATED_PROGRESS,
    Math.max(INITIAL_PROGRESS, timeEstimate, completedFloor)
  );
}
