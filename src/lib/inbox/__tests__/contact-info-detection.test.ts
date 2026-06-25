import test from "node:test";
import assert from "node:assert/strict";
import { messageSharesContactInfo, extractEmailFromMessage } from "../contact-info-detection";

test("detects email addresses in SMS", () => {
  assert.equal(messageSharesContactInfo("My email is jane@example.com thanks"), true);
  assert.equal(extractEmailFromMessage("Reach me at jane.doe+work@company.co"), "jane.doe+work@company.co");
});

test("ignores plain messages without contact info", () => {
  assert.equal(messageSharesContactInfo("Can you come tomorrow morning?"), false);
  assert.equal(messageSharesContactInfo("[Media message]"), false);
});

test("detects phone plus address cues", () => {
  assert.equal(
    messageSharesContactInfo("My name is John Smith. I live at 123 Oak Street, Provo."),
    true
  );
});
