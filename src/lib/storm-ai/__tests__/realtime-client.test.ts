import test from "node:test";
import assert from "node:assert/strict";
import { isRecoverableRealtimeError } from "../realtime-errors";

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
