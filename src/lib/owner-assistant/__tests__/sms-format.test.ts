import test from "node:test";
import assert from "node:assert/strict";
import { ownerAssistantSmsText } from "../sms-format";

test("owner assistant SMS removes Markdown emphasis and headings", () => {
  assert.equal(
    ownerAssistantSmsText("### Appointment\n**Customer:** Riley\n***Confirmed***"),
    "Appointment\nCustomer: Riley\nConfirmed"
  );
});

test("owner assistant SMS turns links and inline code into plain text", () => {
  assert.equal(
    ownerAssistantSmsText("Open [the visit](https://example.com/visit/1) and use `SERVICE`."),
    "Open the visit: https://example.com/visit/1 and use SERVICE."
  );
});
