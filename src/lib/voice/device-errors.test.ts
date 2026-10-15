import test from "node:test";
import assert from "node:assert/strict";
import {
  isTransientVoiceTransportError,
  isVoiceTokenError,
} from "./device-errors";

test("classifies Twilio's generic connection errors as recoverable transport errors", () => {
  for (const code of [31000, 31003, 31005, 31009]) {
    assert.equal(isTransientVoiceTransportError({ code }), true, String(code));
  }
  assert.equal(isTransientVoiceTransportError({ code: 31401 }), false);
});

test("recognizes transport errors by message when Twilio omits a useful code", () => {
  assert.equal(
    isTransientVoiceTransportError({ message: "Websocket connection unexpectedly ended" }),
    true
  );
  assert.equal(isTransientVoiceTransportError({ message: "Microphone permission denied" }), false);
});

test("recognizes voice token errors separately", () => {
  assert.equal(isVoiceTokenError({ code: 31205 }), true);
  assert.equal(isVoiceTokenError({ message: "Access token expired" }), true);
  assert.equal(isVoiceTokenError({ code: 31005 }), false);
});
