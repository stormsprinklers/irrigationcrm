import test from "node:test";
import assert from "node:assert/strict";
import { isRecoverableRealtimeError } from "../realtime-errors";
import { nextFrameEncodeAttempt } from "../realtime-client";

test("treats overlapping response.create as recoverable", () => {
  assert.equal(
    isRecoverableRealtimeError(
      "Conversation already has an active response in progress: resp_EF46rLQ5sR4MBNswWa3yx. Wait until the response is finished before creating a new one.",
      "conversation_already_has_active_response"
    ),
    true
  );
  assert.equal(
    isRecoverableRealtimeError(
      "Conversation already has an active response in progress: resp_x."
    ),
    true
  );
});

test("treats session.update shape mismatches as recoverable", () => {
  assert.equal(isRecoverableRealtimeError("Invalid session.type"), true);
});

test("does not swallow unrelated failures", () => {
  assert.equal(isRecoverableRealtimeError("WebRTC handshake failed"), false);
  assert.equal(isRecoverableRealtimeError("Tool timed out"), false);
});

test("nextFrameEncodeAttempt accepts frames under the WebRTC budget", () => {
  assert.equal(nextFrameEncodeAttempt(768, 0.55, 40_000), "ok");
});

test("nextFrameEncodeAttempt shrinks oversized frames before giving up", () => {
  const first = nextFrameEncodeAttempt(768, 0.55, 200_000);
  assert.ok(first !== "ok" && first !== "give_up");
  assert.ok(first.maxEdge < 768);
  assert.ok(first.quality < 0.55);

  assert.equal(nextFrameEncodeAttempt(320, 0.35, 200_000), "give_up");
});
