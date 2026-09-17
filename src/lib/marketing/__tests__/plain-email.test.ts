import test from "node:test";
import assert from "node:assert/strict";
import {
  isHtmlEmailBody,
  isPlainEmailHtml,
  isPlainTextEmailTemplate,
  looksLikePlainEmail,
  textToPlainEmailHtml,
} from "../email-templates";
import { buildMarketingEmailPayload, campaignPlainBodyText, ensureCampaignGreeting } from "../outbound-email";

test("editing preserves spaces, consecutive enters, tabs, and an emptied body", () => {
  for (const draft of ["Hi ", "Hi  ", "Hi\n", "Hi\n\n", "Hi\n\n\n", "  Hi\t there  \n", "", " ", "\n\n", "Hey {customer_first_name},\n\n"]) {
    assert.equal(campaignPlainBodyText("", draft), draft);
  }
});

test("plain campaign text keeps a text part and escapes its tracked HTML part", () => {
  const out = buildMarketingEmailPayload({
    bodyHtml: "",
    bodyText: 'Hi there,\n\n<script>alert("x")</script>\nBook https://example.com/book?a=1&b=2',
    unsubscribeUrl: "https://example.com/api/marketing/unsubscribe?token=t",
    recipientId: "rec_1",
  });
  assert.equal(out.omitHtml, false);
  assert.match(out.html, /&lt;script&gt;alert/);
  assert.match(out.html, /api\/marketing\/track\/open/);
  assert.match(out.html, /api\/marketing\/track\/click/);
  assert.match(out.text, /api\/marketing\/track\/click/);
});

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

test("buildMarketingEmailPayload sends unformatted drafts with a simple HTML twin", () => {
  const out = buildMarketingEmailPayload({
    bodyHtml: "",
    bodyText: "Hi neighbor,\n\nJust a note.",
    unsubscribeUrl: "https://example.com/api/marketing/unsubscribe?token=t",
    recipientId: "rec_1",
    signature: { companyName: "Storm Sprinklers", phone: "801-555-0100" },
  });

  assert.equal(out.unbranded, true);
  assert.equal(out.omitHtml, false);
  assert.match(out.html, /track\/open/);
  assert.match(out.text, /Hi neighbor/);
  assert.match(out.text, /Storm Sprinklers/);
  assert.match(out.text, /801-555-0100/);
  assert.match(
    out.text,
    /Unsubscribe: https:\/\/example.com\/api\/marketing\/unsubscribe\?token=t/
  );
  assert.doesNotMatch(out.text, /This is a marketing message/);
  assert.doesNotMatch(out.text, /track\/open/);
});

test("buildMarketingEmailPayload preserves safe editor formatting and removes unsafe markup", () => {
  const out = buildMarketingEmailPayload({
    bodyHtml: '<div data-plain-email="true"><p>Hello <strong>there</strong> <a href="https://stormsprinklers.com/book">Book now</a><script>alert("x")</script></p></div>',
    bodyText: "Hello there Book now",
    unsubscribeUrl: "https://example.com/api/marketing/unsubscribe?token=t",
    recipientId: "rec_1",
  });

  assert.match(out.html, />Unsubscribe</);
  assert.match(out.html, /<strong>there<\/strong>/);
  assert.match(out.html, /api\/marketing\/track\/click/);
  assert.match(out.html, /api\/marketing\/track\/open/);
  assert.doesNotMatch(out.html, /<script>|alert\(/);
  assert.match(out.text, /Hello there/);
  assert.match(out.text, /Unsubscribe: https:\/\/example.com\/api\/marketing\/unsubscribe\?token=t/);
  assert.doesNotMatch(out.text, /This is a marketing message/);
});

test("buildMarketingEmailPayload tracks body links while leaving unsubscribe direct", () => {
  const out = buildMarketingEmailPayload({
    bodyHtml: "<p>Hello <a href=\"https://stormsprinklers.com\">site</a></p>",
    bodyText: "Hello https://stormsprinklers.com",
    unsubscribeUrl: "https://example.com/api/marketing/unsubscribe?token=t",
    recipientId: "rec_1",
  });

  assert.match(out.html, />Unsubscribe</);
  assert.match(out.html, /api\/marketing\/track\/click/);
  assert.match(out.text, /api\/marketing\/track\/click/);
  assert.match(out.html, /api\/marketing\/track\/open/);
  assert.match(out.text, /Unsubscribe: https:\/\/example.com\/api\/marketing\/unsubscribe\?token=t/);
  assert.doesNotMatch(out.text, /This is a marketing message/);
});

test("ensureCampaignGreeting prepends Hey {customer_first_name} when missing", () => {
  assert.equal(ensureCampaignGreeting(""), "Hey {customer_first_name},\n\n");
  assert.match(ensureCampaignGreeting("Winterization is open."), /^Hey \{customer_first_name\},/);
  assert.equal(ensureCampaignGreeting("Hey Jordan,\n\nWe are booked."), "Hey Jordan,\n\nWe are booked.");
});
