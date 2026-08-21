import test from "node:test";
import assert from "node:assert/strict";
import {
  STORM_AI_ECHO_GUARD_MS,
  STORM_AI_INPUT_NOISE_REDUCTION,
  STORM_AI_VAD_THRESHOLD,
  isPartsSearchIntentSpeech,
  isShortAckTranscript,
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

test("echo guard lasts long enough to cover speakerphone bounce", () => {
  assert.ok(STORM_AI_ECHO_GUARD_MS >= 1200);
});

test("short ack helper catches thank-you and bye-bye echo transcripts", () => {
  assert.equal(isShortAckTranscript("Thank you."), true);
  assert.equal(isShortAckTranscript("Bye-bye."), true);
  assert.equal(isShortAckTranscript("bye bye"), true);
  assert.equal(isShortAckTranscript("Okay"), true);
  assert.equal(isShortAckTranscript("Okay, it's showing 18"), false);
  assert.equal(isShortAckTranscript("Yes, it does. So I know that the water is there."), false);
});

test("parts search intent ignores diagnostic check/quote speech", () => {
  assert.equal(
    isPartsSearchIntentSpeech(
      "Now it's time to test the solenoid. You'll need to quote the customer to rewire the valve."
    ),
    false
  );
  assert.equal(
    isPartsSearchIntentSpeech("Let me check the solenoid with your meter."),
    false
  );
  assert.equal(
    isPartsSearchIntentSpeech("Let me search the parts library for that valve."),
    true
  );
  assert.equal(
    isPartsSearchIntentSpeech("I'll look up the part in our catalog."),
    true
  );
  assert.equal(isPartsSearchIntentSpeech("Searching the parts list now."), true);
});
