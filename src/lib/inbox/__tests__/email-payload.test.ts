import test from "node:test";
import assert from "node:assert/strict";
import { buildTwilioEmailPayload } from "../email";

test("Twilio email payload omits unsupported replyTo field", () => {
  const payload = buildTwilioEmailPayload({
    from: "Storm Sprinklers <hello@stormsprinklers.com>",
    to: ["jordan@example.com"],
    subject: "Test",
    html: "<p>Hello</p>",
    replyTo: "jordan@stormsprinklers.com",
  });

  assert.equal("replyTo" in payload, false);
  assert.deepEqual(payload.from, {
    address: "hello@stormsprinklers.com",
    name: "Storm Sprinklers",
  });
  assert.deepEqual(payload.to, [{ address: "jordan@example.com" }]);
});
