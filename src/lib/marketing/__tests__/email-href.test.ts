import test from "node:test";
import assert from "node:assert/strict";
import { emailAnchorHtml, sanitizeEmailHref } from "../email-href";

test("sanitizeEmailHref adds https and rejects javascript", () => {
  assert.equal(sanitizeEmailHref("www.stormsprinklers.com/booking"), "https://www.stormsprinklers.com/booking");
  assert.equal(sanitizeEmailHref("https://www.stormsprinklers.com/booking"), "https://www.stormsprinklers.com/booking");
  assert.equal(sanitizeEmailHref("{booking_link}"), "{booking_link}");
  assert.equal(sanitizeEmailHref("javascript:alert(1)"), "");
  assert.equal(sanitizeEmailHref(""), "");
});

test("emailAnchorHtml builds a click-here link", () => {
  assert.equal(
    emailAnchorHtml("https://www.stormsprinklers.com/booking", "click here"),
    '<a href="https://www.stormsprinklers.com/booking" style="color:#1d4ed8;text-decoration:underline">click here</a>'
  );
});
