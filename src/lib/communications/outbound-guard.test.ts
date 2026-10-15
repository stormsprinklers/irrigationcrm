import test from "node:test";
import assert from "node:assert/strict";
import { isEnvironmentRecipientAllowed } from "./outbound-guard";

test("staging allowlist blocks recipients that were not explicitly designated", () => {
  const previousMode = process.env.OUTBOUND_COMMS_MODE;
  const previousEmails = process.env.OUTBOUND_EMAIL_ALLOWLIST;
  process.env.OUTBOUND_COMMS_MODE = "allowlist";
  process.env.OUTBOUND_EMAIL_ALLOWLIST = "security-sink@example.test";
  try {
    assert.equal(isEnvironmentRecipientAllowed("email", "security-sink@example.test"), true);
    assert.equal(isEnvironmentRecipientAllowed("email", "customer@example.com"), false);
  } finally {
    if (previousMode === undefined) delete process.env.OUTBOUND_COMMS_MODE;
    else process.env.OUTBOUND_COMMS_MODE = previousMode;
    if (previousEmails === undefined) delete process.env.OUTBOUND_EMAIL_ALLOWLIST;
    else process.env.OUTBOUND_EMAIL_ALLOWLIST = previousEmails;
  }
});

test("disabled mode blocks all phone delivery", () => {
  const previousMode = process.env.OUTBOUND_COMMS_MODE;
  process.env.OUTBOUND_COMMS_MODE = "disabled";
  try {
    assert.equal(isEnvironmentRecipientAllowed("sms", "+1 555 010 0000"), false);
  } finally {
    if (previousMode === undefined) delete process.env.OUTBOUND_COMMS_MODE;
    else process.env.OUTBOUND_COMMS_MODE = previousMode;
  }
});
