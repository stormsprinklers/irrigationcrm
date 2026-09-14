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

test("Twilio email payload uses unformatted html when sending plain text", () => {
  const payload = buildTwilioEmailPayload({
    from: "Storm Sprinklers <hello@stormsprinklers.com>",
    to: ["jordan@example.com"],
    subject: "Plain note",
    text: "Just the words.\n\nThanks",
  });

  const content = payload.content as Record<string, unknown>;
  assert.equal(content.text, "Just the words.\n\nThanks");
  assert.equal(typeof content.html, "string");
  assert.match(String(content.html), /Just the words/);
  assert.doesNotMatch(String(content.html), /<table/i);
  assert.doesNotMatch(String(content.html), /<br/i);
});

test("Twilio email payload can omit html for plaintext campaigns", () => {
  const payload = buildTwilioEmailPayload({
    from: "Storm Sprinklers <hello@stormsprinklers.com>",
    to: ["jordan@example.com"],
    subject: "Plain note",
    text: "Just the words.\n\nThanks",
    omitHtml: true,
  });

  const content = payload.content as Record<string, unknown>;
  assert.equal(content.text, "Just the words.\n\nThanks");
  assert.equal(content.html, undefined);
});

test("campaign payload disables SendGrid tracking and injected footers per message", () => {
  const payload = buildTwilioEmailPayload({
    from: "Austin <hello@stormsprinklers.com>",
    to: ["jordan@example.com"],
    subject: "Plain note",
    text: "Book at https://stormsprinklers.com/book-winterization",
    omitHtml: true,
    disableTracking: true,
  });

  const content = payload.content as { html?: string; headers?: Record<string, string> };
  assert.equal(content.html, undefined);
  const smtpApi = JSON.parse(content.headers?.["X-SMTPAPI"] ?? "{}") as {
    filters?: Record<string, { settings?: Record<string, unknown> }>;
  };
  assert.equal(smtpApi.filters?.clicktrack?.settings?.enable, 0);
  assert.equal(smtpApi.filters?.clicktrack?.settings?.enable_text, false);
  assert.equal(smtpApi.filters?.opentrack?.settings?.enable, 0);
  assert.equal(smtpApi.filters?.subscriptiontrack?.settings?.enable, 0);
  assert.equal(smtpApi.filters?.footer?.settings?.enable, 0);
});
