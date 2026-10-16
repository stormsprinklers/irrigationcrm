import test from "node:test";
import assert from "node:assert/strict";
import { getAppBaseUrl } from "@/lib/app-url";
import {
  appendOpenTrackingPixel,
  rewriteTrackedLinks,
  rewriteTrackedUrlsInText,
  safeTrackedDestination,
  shouldSkipTrackedUrl,
  trackedClickUrl,
  verifyMarketingTrackingToken,
} from "../link-tracking";
import { htmlToPlainText } from "../email-draft";
import { buildMarketingEmailPayload } from "../outbound-email";

test("rewriteTrackedLinks wraps http hrefs and skips unsubscribe", () => {
  const html = [
    '<p><a href="https://stormsprinklers.com/winter">Winter</a></p>',
    '<p><a href="https://crm.example.com/api/marketing/unsubscribe?token=abc">Unsub</a></p>',
  ].join("");
  const out = rewriteTrackedLinks(html, "rec_1");
  assert.match(out, /\/api\/marketing\/track\/click\?t=v1\./);
  assert.match(out, /u=https%3A%2F%2Fstormsprinklers.com%2Fwinter/);
  assert.match(out, /href="https:\/\/crm.example.com\/api\/marketing\/unsubscribe\?token=abc"/);
});

test("rewriteTrackedLinks preserves ampersands in destination query strings", () => {
  const out = rewriteTrackedLinks('<a href="https://example.com/book?a=1&amp;b=2">Book</a>', "rec_1");
  assert.match(out, /u=https%3A%2F%2Fexample.com%2Fbook%3Fa%3D1%26b%3D2/);
});

test("rewriteTrackedUrlsInText wraps http URLs and leaves unsubscribe alone", () => {
  const text =
    "Book here https://stormsprinklers.com/book.\nUnsubscribe from marketing emails: https://crm.example.com/api/marketing/unsubscribe?token=abc";
  const out = rewriteTrackedUrlsInText(text, "rec_1");
  assert.match(out, /\/api\/marketing\/track\/click\?t=v1\./);
  assert.match(out, /u=https%3A%2F%2Fstormsprinklers.com%2Fbook/);
  assert.match(out, /unsubscribe\?token=abc/);
  assert.ok(shouldSkipTrackedUrl("https://x/api/marketing/unsubscribe?token=1"));
});

test("buildMarketingEmailPayload tracks campaign links and opens", () => {
  const out = buildMarketingEmailPayload({
    bodyHtml: '<p>Hello <a href="https://stormsprinklers.com">site</a></p>',
    bodyText: "Hello https://stormsprinklers.com",
    unsubscribeUrl: `${getAppBaseUrl()}/api/marketing/unsubscribe?token=t`,
    recipientId: "rec_1",
  });
  assert.match(out.html, />Unsubscribe</);
  assert.match(out.html, /\/api\/marketing\/track\/click/);
  assert.match(out.text, /\/api\/marketing\/track\/click/);
  assert.match(out.text, /\/api\/marketing\/unsubscribe\?token=t/);
  assert.match(out.html, /track\/open/);
  assert.doesNotMatch(out.text, /track\/open/);
});

test("tracked redirects accept only absolute web URLs", () => {
  assert.equal(safeTrackedDestination("javascript:alert(1)"), null);
  assert.equal(safeTrackedDestination("//evil.example"), null);
  assert.equal(safeTrackedDestination("https://example.com/a%20b"), "https://example.com/a%20b");
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
  assert.match(html, /\/api\/marketing\/track\/open\?t=v1\./);
  assert.equal(appendOpenTrackingPixel(html, "rec_1"), html);
});

test("click tracking tokens bind recipient, purpose, destination, and expiry", () => {
  const destination = "https://example.com/book?a=1";
  const tracked = new URL(trackedClickUrl("rec_1", destination));
  const token = tracked.searchParams.get("t") ?? "";
  const normalized = tracked.searchParams.get("u") ?? "";
  assert.equal(verifyMarketingTrackingToken(token, "click", normalized), "rec_1");
  assert.equal(verifyMarketingTrackingToken(token, "open"), null);
  assert.equal(verifyMarketingTrackingToken(token, "click", "https://evil.example"), null);
  assert.equal(verifyMarketingTrackingToken(`${token}x`, "click", normalized), null);
});
