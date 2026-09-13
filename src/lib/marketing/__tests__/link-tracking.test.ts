import test from "node:test";
import assert from "node:assert/strict";
import { getAppBaseUrl } from "@/lib/app-url";
import {
  appendOpenTrackingPixel,
  htmlToPlainText,
  rewriteTrackedLinks,
  rewriteTrackedUrlsInText,
  shouldSkipTrackedUrl,
} from "../link-tracking";
import { buildMarketingEmailPayload } from "../outbound-email";

test("rewriteTrackedLinks wraps http hrefs and skips unsubscribe", () => {
  const html = [
    '<p><a href="https://stormsprinklers.com/winter">Winter</a></p>',
    '<p><a href="https://crm.example.com/api/marketing/unsubscribe?token=abc">Unsub</a></p>',
  ].join("");
  const out = rewriteTrackedLinks(html, "rec_1");
  assert.match(out, /\/api\/marketing\/track\/click\?r=rec_1/);
  assert.match(out, /u=https%3A%2F%2Fstormsprinklers.com%2Fwinter/);
  assert.match(out, /href="https:\/\/crm.example.com\/api\/marketing\/unsubscribe\?token=abc"/);
});

test("rewriteTrackedUrlsInText wraps http URLs and leaves unsubscribe alone", () => {
  const text =
    "Book here https://stormsprinklers.com/book.\nUnsubscribe from marketing emails: https://crm.example.com/api/marketing/unsubscribe?token=abc";
  const out = rewriteTrackedUrlsInText(text, "rec_1");
  assert.match(out, /\/api\/marketing\/track\/click\?r=rec_1/);
  assert.match(out, /u=https%3A%2F%2Fstormsprinklers.com%2Fbook/);
  assert.match(out, /unsubscribe\?token=abc/);
  assert.ok(shouldSkipTrackedUrl("https://x/api/marketing/unsubscribe?token=1"));
});

test("buildMarketingEmailPayload tracks links in both email parts", () => {
  const out = buildMarketingEmailPayload({
    bodyHtml: '<p>Hello <a href="https://stormsprinklers.com">site</a></p>',
    bodyText: "Hello https://stormsprinklers.com",
    unsubscribeUrl: `${getAppBaseUrl()}/api/marketing/unsubscribe?token=t`,
    recipientId: "rec_1",
  });
  assert.match(out.html, />Unsubscribe</);
  assert.match(out.text, /\/api\/marketing\/track\/click\?r=rec_1/);
  assert.match(out.text, /\/api\/marketing\/unsubscribe\?token=t/);
  assert.doesNotMatch(out.text, /track\/open/);
});

test("htmlToPlainText keeps hyperlink text and URL", () => {
  assert.equal(
    htmlToPlainText('<p>Please <a href="https://stormsprinklers.com/booking">click here</a> to book.</p>'),
    "Please click here (https://stormsprinklers.com/booking) to book."
  );
  assert.equal(
    htmlToPlainText('<a href="https://stormsprinklers.com">https://stormsprinklers.com</a>'),
    "https://stormsprinklers.com"
  );
});

test("appendOpenTrackingPixel inserts a 1x1 image once", () => {
  const html = appendOpenTrackingPixel("<p>Hi</p>", "rec_1");
  assert.match(html, /\/api\/marketing\/track\/open\?r=rec_1/);
  assert.equal(appendOpenTrackingPixel(html, "rec_1"), html);
});
