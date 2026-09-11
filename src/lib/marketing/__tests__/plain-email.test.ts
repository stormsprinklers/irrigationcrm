import test from "node:test";
import assert from "node:assert/strict";
import { isHtmlEmailBody, isPlainTextEmailTemplate } from "../email-templates";
import { buildMarketingEmailPayload } from "../outbound-email";

test("isHtmlEmailBody treats empty and tagless bodies as plain text", () => {
  assert.equal(isHtmlEmailBody(""), false);
  assert.equal(isHtmlEmailBody("Hello there"), false);
  assert.equal(isHtmlEmailBody("<p>Hello</p>"), true);
});

test("isPlainTextEmailTemplate matches the plain template id", () => {
  assert.equal(isPlainTextEmailTemplate("plain"), true);
  assert.equal(isPlainTextEmailTemplate("letter"), false);
});

test("buildMarketingEmailPayload sends text-only for unformatted bodies", () => {
  const out = buildMarketingEmailPayload({
    bodyHtml: "",
    bodyText: "Hi neighbor,\n\nJust a note.",
    unsubscribeUrl: "https://example.com/api/marketing/unsubscribe?token=t",
    recipientId: "rec_1",
  });

  assert.equal(out.html, undefined);
  assert.match(out.text, /Hi neighbor/);
  assert.match(out.text, /Unsubscribe from marketing emails: https:\/\/example.com\/api\/marketing\/unsubscribe\?token=t/);
});

test("buildMarketingEmailPayload keeps HTML for formatted bodies", () => {
  const out = buildMarketingEmailPayload({
    bodyHtml: "<p>Hello <a href=\"https://stormsprinklers.com\">site</a></p>",
    bodyText: "Hello",
    unsubscribeUrl: "https://example.com/api/marketing/unsubscribe?token=t",
    recipientId: "rec_1",
  });

  assert.match(out.html ?? "", /<p>Hello/);
  assert.match(out.html ?? "", /\/api\/marketing\/track\/click\?r=rec_1/);
  assert.match(out.html ?? "", /Unsubscribe from marketing emails/);
  assert.match(out.text, /Unsubscribe from marketing emails/);
});
