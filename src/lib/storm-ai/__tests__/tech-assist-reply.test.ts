import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTechAssistSpeakInstructions,
  formatTechAssistAssistantText,
} from "../tech-assist-reply";

test("formatTechAssistAssistantText speaks resolutions", () => {
  const text = formatTechAssistAssistantText({
    ok: true,
    data: {
      step: {
        type: "RESOLUTION",
        title: "Timer module",
        instructions: "Replace the timer station module for this zone.",
        done: true,
      },
    },
  });
  assert.match(text ?? "", /Resolution/);
  assert.match(text ?? "", /timer station module/i);
});

test("buildTechAssistSpeakInstructions forces speech on resolution", () => {
  const instructions = buildTechAssistSpeakInstructions({
    ok: true,
    data: {
      step: {
        type: "RESOLUTION",
        title: "Timer module",
        instructions: "Likely the timer module for this zone.",
        done: true,
      },
    },
  });
  assert.match(instructions ?? "", /must speak/i);
  assert.match(instructions ?? "", /do not stay silent/i);
  assert.match(instructions ?? "", /timer module/i);
});

test("buildTechAssistSpeakInstructions clarifies unmatched options", () => {
  const instructions = buildTechAssistSpeakInstructions({
    ok: true,
    data: {
      unmatched: true,
      step: {
        type: "DIAGNOSTIC",
        title: "Manual",
        test: "Does it open manually?",
        options: [{ label: "Yes" }, { label: "No" }],
      },
    },
  });
  assert.match(instructions ?? "", /did not match/i);
});
