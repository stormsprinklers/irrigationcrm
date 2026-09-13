import test from "node:test";
import assert from "node:assert/strict";
import { isMarketingOptedOut, marketingConsentLabel } from "../opt-out";
import { appendMarketingUnsubscribeText, appendPlainUnsubscribeText, prefsAllOptedOut } from "../unsubscribe";
import {
  isExactSmsStart,
  isExactSmsStop,
  marketingSmsStartReply,
  marketingSmsStopReply,
} from "../../inbox/sms-opt-keywords";

test("marketingConsentLabel is opted in unless explicitly opted out", () => {
  assert.equal(marketingConsentLabel(false), "Opted in");
  assert.equal(marketingConsentLabel(undefined), "Opted in");
  assert.equal(marketingConsentLabel(true), "Opted out");
});

test("isMarketingOptedOut is only true for explicit opt-out", () => {
  assert.equal(isMarketingOptedOut(true), true);
  assert.equal(isMarketingOptedOut(false), false);
  assert.equal(isMarketingOptedOut(undefined), false);
});

test("prefsAllOptedOut requires every channel off", () => {
  assert.equal(
    prefsAllOptedOut({
      marketingEmailOptOut: false,
      marketingSmsOptOut: true,
      appointmentReminderEmailOptOut: true,
      appointmentReminderSmsOptOut: true,
    }),
    false
  );
  assert.equal(
    prefsAllOptedOut({
      marketingEmailOptOut: true,
      marketingSmsOptOut: true,
      appointmentReminderEmailOptOut: true,
      appointmentReminderSmsOptOut: true,
    }),
    true
  );
});

test("STOP and START match only when they are the whole message", () => {
  assert.equal(isExactSmsStop("stop"), true);
  assert.equal(isExactSmsStop("STOP"), true);
  assert.equal(isExactSmsStop(" stop "), true);
  assert.equal(isExactSmsStop("stop please"), false);
  assert.equal(isExactSmsStop("please stop"), false);
  assert.equal(isExactSmsStart("start"), true);
  assert.equal(isExactSmsStart("START"), true);
  assert.equal(isExactSmsStart("start again"), false);
});

test("STOP and START auto-replies mention the company and the other keyword", () => {
  const stop = marketingSmsStopReply("Storm Sprinklers");
  const start = marketingSmsStartReply("Storm Sprinklers");
  assert.match(stop, /Storm Sprinklers/);
  assert.match(stop, /opted out/i);
  assert.match(stop, /START/);
  assert.match(start, /Storm Sprinklers/);
  assert.match(start, /opted in/i);
  assert.match(start, /STOP/);
});

test("appendPlainUnsubscribeText adds a working unsubscribe URL", () => {
  const out = appendPlainUnsubscribeText("Hi there", "https://example.com/unsub?token=abc");
  assert.match(out, /Unsubscribe: https:\/\/example.com\/unsub\?token=abc/);
  assert.doesNotMatch(out, /marketing message/);
});

test("appendMarketingUnsubscribeText keeps the designed-email footer", () => {
  const out = appendMarketingUnsubscribeText("Hi there", "https://example.com/unsub?token=abc");
  assert.match(out, /Unsubscribe from marketing emails: https:\/\/example.com\/unsub\?token=abc/);
});
