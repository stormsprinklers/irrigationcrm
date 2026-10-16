import assert from "node:assert/strict";
import test from "node:test";
import { iosVoicePushCredentialSid } from "./push-credential";

test("iOS voice supports the deployed credential ID setting", () => {
  assert.equal(iosVoicePushCredentialSid({ TWILIO_PUSH_CREDENTIAL_ID: " CRlegacy " }), "CRlegacy");
});
test("explicit SID takes precedence and blank settings fall back", () => {
  assert.equal(iosVoicePushCredentialSid({ TWILIO_PUSH_CREDENTIAL_SID: "CRcurrent", TWILIO_PUSH_CREDENTIAL_ID: "CRlegacy" }), "CRcurrent");
  assert.equal(iosVoicePushCredentialSid({ TWILIO_PUSH_CREDENTIAL_SID: " ", TWILIO_PUSH_CREDENTIAL_ID: "CRlegacy" }), "CRlegacy");
  assert.equal(iosVoicePushCredentialSid({}), undefined);
});
