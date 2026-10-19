import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOwnerAssistantWssUrl } from "../auth";

test("owner assistant Railway domains become the Twilio media WSS endpoint", () => {
  assert.equal(
    normalizeOwnerAssistantWssUrl("owner-assistant.up.railway.app"),
    "wss://owner-assistant.up.railway.app/twilio/media"
  );
  assert.equal(
    normalizeOwnerAssistantWssUrl("https://owner-assistant.up.railway.app/"),
    "wss://owner-assistant.up.railway.app/twilio/media"
  );
});

test("owner assistant WSS normalization repairs a duplicated protocol", () => {
  assert.equal(
    normalizeOwnerAssistantWssUrl("wss://https://owner-assistant.up.railway.app/twilio/media"),
    "wss://owner-assistant.up.railway.app/twilio/media"
  );
});

test("owner assistant WSS normalization rejects insecure or credentialed URLs", () => {
  assert.equal(normalizeOwnerAssistantWssUrl("http://owner-assistant.example.com"), "");
  assert.equal(normalizeOwnerAssistantWssUrl("wss://user:pass@owner-assistant.example.com"), "");
});
