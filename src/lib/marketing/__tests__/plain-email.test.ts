import test from "node:test";
import assert from "node:assert/strict";
import {
  isHtmlEmailBody,
  isPlainEmailHtml,
  isPlainTextEmailTemplate,
  looksLikePlainEmail,
  textToPlainEmailHtml,
} from "../email-templates";
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

test("looksLikePlainEmail detects stored plain HTML and text-only drafts", () => {
  assert.equal(looksLikePlainEmail("", "Hi neighbor"), true);
  assert.equal(looksLikePlainEmail(textToPlainEmailHtml("Hi neighbor"), "Hi neighbor"), true);
  assert.equal(looksLikePlainEmail("<p>Hello</p>", "Hello"), false);
  assert.equal(isPlainEmailHtml(textToPlainEmailHtml("Hi")), true);
});

test("buildMarketingEmailPayload sends HTML with an open pixel for unformatted bodies", () => {
  const out = buildMarketingEmailPayload({
    bodyHtml: "",
    bodyText: "Hi neighbor,\n\nJust a note.",
    unsubscribeUrl: "https://example.com/api/marketing/unsubscribe?token=t",
    recipientId: "rec_1",
  });

  assert.match(out.text, /Hi neighbor/);
  assert.match(
    out.text,
    /Unsubscribe from marketing emails: https:\/\/example.com\/api\/marketing\/unsubscribe\?token=t/
  );
  assert.match(out.html ?? "", /Hi neighbor/);
  assert.match(out.html ?? "", /\/api\/marketing\/track\/open\?r=rec_1/);
  assert.match(
    out.html ?? "",
    /<a href="https:\/\/example.com\/api\/marketing\/unsubscribe\?token=t"[^>]*>Unsubscribe from marketing emails<\/a>/
  );
  assert.doesNotMatch(out.html ?? "", /Unsubscribe from marketing emails: https:\/\/example.com/);
});

test("buildMarketingEmailPayload keeps bold formatting and an unsubscribe button", () => {
  const out = buildMarketingEmailPayload({
    bodyHtml: '<div data-plain-email="true"><p>Hello <strong>there</strong></p></div>',
    bodyText: "Hello there",
    unsubscribeUrl: "https://example.com/api/marketing/unsubscribe?token=t",
    recipientId: "rec_1",
  });

  assert.match(out.html ?? "", /<strong>there<\/strong>/);
  assert.match(
    out.html ?? "",
    /<a href="https:\/\/example.com\/api\/marketing\/unsubscribe\?token=t"/
  );
  assert.match(out.html ?? "", /background-color:#4C9BC8/);
  assert.doesNotMatch(out.html ?? "", /&lt;strong&gt;/);
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
  assert.match(out.html ?? "", /\/api\/marketing\/track\/open\?r=rec_1/);
  assert.match(out.html ?? "", /Unsubscribe from marketing emails/);
  assert.match(out.text, /Unsubscribe from marketing emails/);
});
