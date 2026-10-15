import test from "node:test";
import assert from "node:assert/strict";
import twilio from "twilio";
import { dialAssignedUser } from "./routing";

test("assigned phone numbers dial one user identity with company branding", () => {
  const response = new twilio.twiml.VoiceResponse();

  dialAssignedUser(
    response,
    {
      id: "company_1",
      name: "Storm Sprinklers",
      recordCalls: false,
      brandPrimaryColor: "#123456",
      brandSecondaryColor: "#abcdef",
    },
    "user_1",
    "+18015550100"
  );

  const xml = response.toString();
  assert.match(xml, /<Client>company_1_user_1/);
  assert.match(xml, /name="companyId" value="company_1"/);
  assert.match(xml, /name="companyName" value="Storm Sprinklers"/);
  assert.match(xml, /dial-complete\?companyId=company_1/);
  assert.equal((xml.match(/<Client>/g) ?? []).length, 1);
});
