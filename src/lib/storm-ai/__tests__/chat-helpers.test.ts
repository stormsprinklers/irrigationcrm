import test from "node:test";
import assert from "node:assert/strict";
import {
  isOpenAiRateLimitError,
  parseRetryAfterMs,
  wantsNewTechIssue,
} from "../chat-helpers";

test("wantsNewTechIssue detects problem switches", () => {
  assert.equal(wantsNewTechIssue("different problem — controller is blank"), true);
  assert.equal(wantsNewTechIssue("start over"), true);
  assert.equal(wantsNewTechIssue("yes it opens manually"), false);
  assert.equal(wantsNewTechIssue("32 ohms"), false);
});

test("parseRetryAfterMs reads OpenAI TPM messages", () => {
  const body =
    'Rate limit reached for gpt-4o ... Please try again in 5.22s. Visit https://platform.openai.com/';
  assert.equal(parseRetryAfterMs(body), 5220);
  assert.equal(parseRetryAfterMs("no hint"), null);
});

test("isOpenAiRateLimitError detects TPM payloads", () => {
  assert.equal(isOpenAiRateLimitError(429, "anything"), true);
  assert.equal(
    isOpenAiRateLimitError(
      500,
      "Rate limit reached for gpt-4o in organization on tokens per min (TPM)"
    ),
    true
  );
  assert.equal(isOpenAiRateLimitError(500, "server exploded"), false);
});
