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

test("action wait maps open tracking to click tracking", () => {
  const wait = parseWaitConfig({ mode: "action", action: "opened" });
  assert.equal(wait.usesAction, true);
  assert.equal(wait.hasTimeout, false);
  assert.equal(wait.action, "clicked");
  assert.equal(waitSummary({ mode: "action", action: "clicked" }), "Until they click a link");
  assert.equal(
    waitSummary({ mode: "action", action: "opened_or_clicked" }),
    "Until they click a link"
  );
  const from = new Date("2026-09-08T12:00:00.000Z");
  assert.equal(waitTimeoutAt(wait, from), null);
  assert.equal(nextWaitCheckAt(wait, null, from).getTime() - from.getTime(), REPLY_POLL_MS);
});

test("reply and action waits honor an explicit timeout", () => {
  const from = new Date("2026-09-08T12:00:00.000Z");
  const replyRaw = {
    mode: "reply",
    timeoutEnabled: true,
    delayAmount: 6,
    delayUnit: "hours",
    replyKeyword: "yes",
  };
  const reply = parseWaitConfig(replyRaw);
  assert.equal(reply.hasTimeout, true);
  assert.equal(waitSummary(replyRaw), "Until reply containing “yes” or 6 hours");
  assert.equal(waitTimeoutAt(reply, from)?.toISOString(), "2026-09-08T18:00:00.000Z");

  const actionRaw = {
    mode: "action",
    action: "opened",
    timeoutEnabled: true,
    delayAmount: 2,
    delayUnit: "days",
  };
  const action = parseWaitConfig(actionRaw);
  assert.equal(action.hasTimeout, true);
  assert.equal(waitSummary(actionRaw), "Until they click a link or 2 days");
  assert.equal(waitTimeoutAt(action, from)?.toISOString(), "2026-09-10T12:00:00.000Z");
});

test("recipientMatchesWaitAction only counts clicks", () => {
  assert.equal(recipientMatchesWaitAction({ openedAt: new Date(), clickCount: 0 }, "clicked"), false);
  assert.equal(recipientMatchesWaitAction({ clickedAt: new Date(), clickCount: 1 }, "clicked"), true);
  assert.equal(recipientMatchesWaitAction(null, "clicked"), false);
});

test("parseBranchWaitMs uses minutes when set", () => {
  assert.equal(parseBranchWaitMs({ waitAmount: 15, waitUnit: "minutes" }), 15 * 60 * 1000);
  assert.equal(parseBranchWaitMs({ waitHours: 2 }), 2 * 60 * 60 * 1000);
});
