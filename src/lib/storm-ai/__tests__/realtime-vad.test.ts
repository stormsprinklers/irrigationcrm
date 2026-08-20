import test from "node:test";
import assert from "node:assert/strict";
import {
  STORM_AI_INPUT_NOISE_REDUCTION,
  STORM_AI_VAD_THRESHOLD,
  stormAiServerVad,
} from "../realtime-vad";

test("VAD threshold stays high enough for noisy field environments", () => {
  // OpenAI default is 0.5; we intentionally stay well above that.
  assert.ok(STORM_AI_VAD_THRESHOLD >= 0.85);
  assert.ok(STORM_AI_VAD_THRESHOLD <= 1);
});

test("stormAiServerVad keeps interrupt off and honors create_response", () => {
  const vad = stormAiServerVad({ createResponse: true });
  assert.equal(vad.type, "server_vad");
  assert.equal(vad.interrupt_response, false);
  assert.equal(vad.create_response, true);
  assert.equal(vad.threshold, STORM_AI_VAD_THRESHOLD);
  assert.equal(STORM_AI_INPUT_NOISE_REDUCTION.type, "far_field");
});
