import assert from "node:assert/strict";
import test from "node:test";
import {
  canCompleteEstimateVslGate,
  createEstimateVslGate,
  decodeEstimateVslGateToken,
  isEstimateCheckoutReturn,
  normalizeEstimateVslWaitSeconds,
} from "../estimate-vsl";

test("estimate checkout returns bypass the VSL", () => {
  for (const query of [
    "deposit=success&session_id=checkout",
    "deposit=cancelled",
    "payment=card-saved&session_id=setup",
    "payment=card-cancelled",
  ]) {
    assert.equal(isEstimateCheckoutReturn(new URLSearchParams(query)), true);
  }
  assert.equal(isEstimateCheckoutReturn(new URLSearchParams()), false);
});

test("estimate VSL wait defaults to 30 seconds and stays within limits", () => {
  assert.equal(normalizeEstimateVslWaitSeconds(undefined), 30);
  assert.equal(normalizeEstimateVslWaitSeconds(-5), 0);
  assert.equal(normalizeEstimateVslWaitSeconds(45.4), 45);
  assert.equal(normalizeEstimateVslWaitSeconds(10_000), 3_600);
});

test("first-time customers receive a timed signed gate", async () => {
  const previousSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "estimate-vsl-test-secret";
  try {
    const gate = await createEstimateVslGate({
      company: {
        id: "company",
        estimateVslEnabled: true,
        estimateVslVideoUrl: "https://example.com/video.mp4",
        estimateVslWaitSeconds: 30,
      },
      customerId: "customer",
      estimateId: "estimate",
      viewedAt: null,
    });
    assert.ok(gate);
    assert.equal(gate.canSkipImmediately, false);
    const payload = decodeEstimateVslGateToken(gate.gateToken);
    assert.ok(payload);
    assert.equal(payload.customerId, "customer");
    assert.equal(
      canCompleteEstimateVslGate({ payload, completedVideo: false, now: payload.startedAt + 29_999 }),
      false
    );
    assert.equal(
      canCompleteEstimateVslGate({ payload, completedVideo: false, now: payload.startedAt + 30_000 }),
      true
    );
    assert.equal(canCompleteEstimateVslGate({ payload, completedVideo: true }), true);
  } finally {
    if (previousSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousSecret;
  }
});

test("returning customers may skip the VSL immediately", async () => {
  const previousSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "estimate-vsl-test-secret";
  try {
    const gate = await createEstimateVslGate({
      company: {
        id: "company",
        estimateVslEnabled: true,
        estimateVslVideoUrl: "https://example.com/video.mp4",
        estimateVslWaitSeconds: 30,
      },
      customerId: "customer",
      estimateId: "revised-estimate",
      viewedAt: new Date(),
    });
    assert.ok(gate);
    assert.equal(gate.canSkipImmediately, true);
  } finally {
    if (previousSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousSecret;
  }
});

test("disabled or unconfigured VSL does not gate estimates", async () => {
  assert.equal(
    await createEstimateVslGate({
      company: {
        id: "company",
        estimateVslEnabled: false,
        estimateVslVideoUrl: "https://example.com/video.mp4",
        estimateVslWaitSeconds: 30,
      },
      customerId: "customer",
      estimateId: "estimate",
      viewedAt: null,
    }),
    null
  );
});
