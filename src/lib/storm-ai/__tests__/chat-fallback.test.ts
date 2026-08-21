import test from "node:test";
import assert from "node:assert/strict";
import { formatTechAssistAssistantText } from "../tech-assist-reply";

test("formatTechAssistAssistantText builds next diagnostic copy", () => {
  const text = formatTechAssistAssistantText({
    ok: true,
    data: {
      step: {
        type: "DIAGNOSTIC",
        title: "Solenoid ohms",
        test: "Measure ohms across the solenoid leads.",
        tips: "Disconnect both wires first.",
        options: [
          { label: "20-60" },
          { label: "Open / infinite" },
        ],
      },
    },
  });
  assert.match(text ?? "", /Solenoid ohms/);
  assert.match(text ?? "", /Measure ohms/);
  assert.match(text ?? "", /20-60/);
  assert.match(text ?? "", /Disconnect both wires/);
});

test("formatTechAssistAssistantText clarifies unmatched options", () => {
  const text = formatTechAssistAssistantText({
    ok: true,
    data: {
      unmatched: true,
      step: {
        type: "DIAGNOSTIC",
        title: "Manual open",
        test: "Does the valve open manually?",
        options: [
          { label: "Yes, it opens manually." },
          { label: "No, it does not open manually." },
        ],
      },
    },
  });
  assert.match(text ?? "", /couldn’t match/i);
  assert.match(text ?? "", /Yes, it opens manually/);
});

test("formatTechAssistAssistantText returns null without a step", () => {
  assert.equal(
    formatTechAssistAssistantText({ ok: true, data: { active: false } }),
    null
  );
  assert.equal(formatTechAssistAssistantText(null), null);
});
