import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCallSummaryUserMessage,
  callSummaryForDisplay,
  isLikelyOutboundVoicemailTranscript,
} from "./call-summary-context";

const OUTBOUND_VOICEMAIL =
  "Please leave your message for 8 0 1 9 1 8 3 9 8 3. Hey, Lori, this is Riley with Chestnut and Cheer. I was wondering if you had availability tomorrow around 2.";

test("recognizes a carrier greeting before an outbound employee voicemail", () => {
  assert.equal(isLikelyOutboundVoicemailTranscript(OUTBOUND_VOICEMAIL, "OUTBOUND"), true);
  assert.equal(isLikelyOutboundVoicemailTranscript(OUTBOUND_VOICEMAIL, "INBOUND"), false);
});

test("summary context fixes employee and customer roles for outbound voicemail", () => {
  const prompt = buildCallSummaryUserMessage(OUTBOUND_VOICEMAIL, {
    direction: "OUTBOUND",
    employeeName: "Riley",
    customerName: "Lori",
  });

  assert.match(prompt, /Direction: OUTBOUND/);
  assert.match(prompt, /Company employee: Riley/);
  assert.match(prompt, /Customer: Lori/);
  assert.match(prompt, /Automated voicemail greeting detected: YES/);
  assert.match(prompt, /employee left a voicemail/);
  assert.match(prompt, /do not invent a customer objection/i);
});

test("replaces a legacy role-swapped outbound voicemail summary at display time", () => {
  const summary = callSummaryForDisplay({
    transcript: OUTBOUND_VOICEMAIL,
    direction: "OUTBOUND",
    employeeName: "Riley",
    customerName: "Lori",
    aiSummary:
      "Riley called to inquire about availability and did not receive confirmation from the company.",
  });

  assert.equal(
    summary,
    "Riley placed an outbound call to Lori and left a voicemail. The customer did not participate in the recorded conversation. Review the transcript for the message details."
  );
});
