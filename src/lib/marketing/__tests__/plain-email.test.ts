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

test("HTML keeps the unsubscribe URL behind a small link and escapes typed markup", () => {
  const out = buildMarketingEmailPayload({
    bodyHtml: "",
    bodyText: 'Hi there,\n\n<script>alert("x")</script>\nBook https://example.com/book?a=1&b=2',
    unsubscribeUrl: "https://example.com/api/marketing/unsubscribe?token=t",
    recipientId: "rec_1",
  });
  assert.match(out.html, /font-size:12px/);
  assert.match(out.html, /href="https:\/\/example.com\/api\/marketing\/unsubscribe\?token=t"[^>]*>Unsubscribe<\/a>/);
  assert.doesNotMatch(out.html, /Unsubscribe:|<script>|track\/open/);
  assert.match(out.html, /&lt;script&gt;/);
  assert.match(out.html, /href="[^"]*\/api\/marketing\/track\/click/);
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

test("buildMarketingEmailPayload sends simple HTML and a text fallback with unsubscribe and no open pixel", () => {
  const out = buildMarketingEmailPayload({
    bodyHtml: "",
    bodyText: "Hi neighbor,\n\nJust a note.",
    unsubscribeUrl: "https://example.com/api/marketing/unsubscribe?token=t",
    recipientId: "rec_1",
    signature: { companyName: "Storm Sprinklers", phone: "801-555-0100" },
  });

  assert.equal(out.unbranded, true);
  assert.equal(out.omitHtml, false);
  assert.match(out.html, />Unsubscribe</);
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

test("buildMarketingEmailPayload converts leftover HTML drafts to text", () => {
  const out = buildMarketingEmailPayload({
    bodyHtml: '<div data-plain-email="true"><p>Hello <strong>there</strong></p></div>',
    bodyText: "",
    unsubscribeUrl: "https://example.com/api/marketing/unsubscribe?token=t",
    recipientId: "rec_1",
  });

  assert.match(out.html, />Unsubscribe</);
  assert.match(out.text, /Hello there/);
  assert.match(out.text, /Unsubscribe: https:\/\/example.com\/api\/marketing\/unsubscribe\?token=t/);
  assert.doesNotMatch(out.text, /<strong>/);
  assert.doesNotMatch(out.text, /This is a marketing message/);
});

test("buildMarketingEmailPayload tracks URLs in both email parts", () => {
  const out = buildMarketingEmailPayload({
    bodyHtml: "<p>Hello <a href=\"https://stormsprinklers.com\">site</a></p>",
    bodyText: "Hello https://stormsprinklers.com",
    unsubscribeUrl: "https://example.com/api/marketing/unsubscribe?token=t",
    recipientId: "rec_1",
  });

  assert.match(out.html, />Unsubscribe</);
  assert.match(out.text, /\/api\/marketing\/track\/click\?r=rec_1/);
  assert.match(out.text, /Unsubscribe: https:\/\/example.com\/api\/marketing\/unsubscribe\?token=t/);
  assert.doesNotMatch(out.text, /This is a marketing message/);
});

test("ensureCampaignGreeting prepends Hey {customer_first_name} when missing", () => {
  assert.equal(ensureCampaignGreeting(""), "Hey {customer_first_name},\n\n");
  assert.match(ensureCampaignGreeting("Winterization is open."), /^Hey \{customer_first_name\},/);
  assert.equal(ensureCampaignGreeting("Hey Jordan,\n\nWe are booked."), "Hey Jordan,\n\nWe are booked.");
});
