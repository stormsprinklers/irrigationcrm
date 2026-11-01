import assert from "node:assert/strict";
import test from "node:test";
import {
  createEstimatePreviewToken,
  verifyEstimatePreviewToken,
} from "../estimate-preview";

test("estimate preview tokens are scoped, tamper-resistant, and short lived", () => {
  const previous = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "estimate-preview-test-secret";
  try {
    const now = 1_000_000;
    const token = createEstimatePreviewToken(
      { companyId: "company-1", estimateId: "estimate-1" },
      now
    );
    assert.deepEqual(verifyEstimatePreviewToken(token, now), {
      companyId: "company-1",
      estimateId: "estimate-1",
      expiresAt: now + 30 * 60 * 1000,
    });
    assert.equal(verifyEstimatePreviewToken(`${token}x`, now), null);
    assert.equal(verifyEstimatePreviewToken(token, now + 31 * 60 * 1000), null);
  } finally {
    if (previous === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previous;
  }
});
