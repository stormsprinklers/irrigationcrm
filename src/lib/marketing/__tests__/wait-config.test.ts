import test from "node:test";
import assert from "node:assert/strict";
import {
  matchingReplyKeyword,
  nextWaitCheckAt,
  parseWaitConfig,
  waitSummary,
  waitTimeoutAt,
  parseBranchWaitMs,
  recipientMatchesWaitAction,
  REPLY_POLL_MS,
} from "../wait-config";

test("parseWaitConfig keeps legacy delayHours as hours", () => {
  const wait = parseWaitConfig({ mode: "delay", delayHours: 36 });
  assert.equal(wait.delayAmount, 36);
  assert.equal(wait.delayUnit, "hours");
  assert.equal(wait.usesReply, false);
  assert.equal(wait.hasTimeout, true);
});

test("waitTimeoutAt supports minutes and days", () => {
  const from = new Date("2026-09-08T12:00:00.000Z");
  const minutes = waitTimeoutAt(
    parseWaitConfig({ mode: "delay", delayAmount: 30, delayUnit: "minutes" }),
    from
  );
  assert.equal(minutes?.toISOString(), "2026-09-08T12:30:00.000Z");

  const days = waitTimeoutAt(
    parseWaitConfig({ mode: "delay", delayAmount: 2, delayUnit: "days" }),
    from
  );
  assert.equal(days?.toISOString(), "2026-09-10T12:00:00.000Z");
});

test("matchingReplyKeyword matches whole words, not substrings", () => {
  assert.equal(matchingReplyKeyword("Yes please", ["yes"]), "yes");
  assert.equal(matchingReplyKeyword("yesterday", ["yes"]), null);
  assert.equal(matchingReplyKeyword("That sounds good!", ["sounds good"]), "sounds good");
  assert.equal(matchingReplyKeyword("ok", []), "ok");
});

test("delay_or_reply summary and next check uses the earlier of timeout and poll", () => {
  const raw = {
    mode: "delay_or_reply",
    delayAmount: 2,
    delayUnit: "hours",
    replyKeyword: "yes, interested",
  };
  const wait = parseWaitConfig(raw);
  assert.equal(wait.usesReply, true);
  assert.equal(waitSummary(raw), "Until 2 hours or reply containing “yes, interested”");
  const from = new Date("2026-09-08T12:00:00.000Z");
  const timeout = waitTimeoutAt(wait, from)!;
  const check = nextWaitCheckAt(wait, timeout, from);
  assert.equal(check.getTime() - from.getTime(), REPLY_POLL_MS);
});

test("action wait polls until open or click and has no timeout", () => {
  const opened = parseWaitConfig({ mode: "action", action: "opened" });
  assert.equal(opened.usesAction, true);
  assert.equal(opened.hasTimeout, false);
  assert.equal(waitSummary({ mode: "action", action: "clicked" }), "Until they click a link");
  assert.equal(
    waitSummary({ mode: "action", action: "opened_or_clicked" }),
    "Until they open an email or click a link"
  );
  const from = new Date("2026-09-08T12:00:00.000Z");
  assert.equal(waitTimeoutAt(opened, from), null);
  assert.equal(nextWaitCheckAt(opened, null, from).getTime() - from.getTime(), REPLY_POLL_MS);
});

test("recipientMatchesWaitAction respects opened vs clicked", () => {
  assert.equal(recipientMatchesWaitAction({ openedAt: new Date(), clickCount: 0 }, "opened"), true);
  assert.equal(recipientMatchesWaitAction({ openedAt: new Date(), clickCount: 0 }, "clicked"), false);
  assert.equal(recipientMatchesWaitAction({ clickedAt: new Date(), clickCount: 1 }, "clicked"), true);
  assert.equal(
    recipientMatchesWaitAction({ clickedAt: new Date(), clickCount: 1 }, "opened_or_clicked"),
    true
  );
  assert.equal(recipientMatchesWaitAction(null, "opened"), false);
});

test("parseBranchWaitMs uses minutes when set", () => {
  assert.equal(parseBranchWaitMs({ waitAmount: 15, waitUnit: "minutes" }), 15 * 60 * 1000);
  assert.equal(parseBranchWaitMs({ waitHours: 2 }), 2 * 60 * 60 * 1000);
});
