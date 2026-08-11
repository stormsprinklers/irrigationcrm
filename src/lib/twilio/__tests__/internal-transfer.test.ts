import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyTwilioOwnedReason,
  describeTwilioOwnedSituation,
  isTwilioOwnedPortabilityReason,
} from "../internal-transfer";

test("classify Twilio-owned portability reasons", () => {
  assert.equal(
    classifyTwilioOwnedReason("ALREADY_IN_THE_TARGET_ACCOUNT"),
    "already_on_account"
  );
  assert.equal(
    classifyTwilioOwnedReason("ALREADY_IN_ONE_OF_YOUR_TWILIO_ACCOUNTS"),
    "in_account_hierarchy"
  );
  assert.equal(
    classifyTwilioOwnedReason("ALREADY_IN_TWILIO_DIFFERENT_OWNER"),
    "different_twilio_owner"
  );
  assert.equal(classifyTwilioOwnedReason("MANUAL_PORT_REQUIRED"), null);
  assert.equal(isTwilioOwnedPortabilityReason("already_in_the_target_account"), true);
});

test("describe Twilio-owned situation copy", () => {
  assert.match(
    describeTwilioOwnedSituation({ kind: "already_on_account", canImport: true }),
    /Already on your Twilio account/
  );
  assert.match(
    describeTwilioOwnedSituation({
      kind: "already_on_account",
      canImport: true,
      crmCompanyName: "Storm Sprinklers",
    }),
    /Storm Sprinklers/
  );
  assert.match(
    describeTwilioOwnedSituation({
      kind: "different_twilio_owner",
      canImport: false,
    }),
    /different Twilio account/
  );
});
