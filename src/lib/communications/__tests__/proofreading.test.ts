import test from "node:test";
import assert from "node:assert/strict";
import { resolveWritingIssues, applyWritingIssue } from "../proofreading";
const issue = (original: string, replacement: string, occurrence = 0) => ({ original, replacement, occurrence, explanation: "Check spelling", kind: "spelling" });
test("applies the correct repeated word without disturbing spaces or blank lines", () => {
  const text = "teh first\n\n  teh second ";
  const [match] = resolveWritingIssues(text, [issue("teh", "the", 1)]);
  assert.equal(applyWritingIssue(text, match), "teh first\n\n  the second ");
  assert.equal(applyWritingIssue("a different draft", match), "a different draft");
});
test("ignores hallucinated offsets, overlaps, merge tokens, URLs, and email addresses", () => {
  const text = "teh {teh} https://example.com/teh user@teh.com";
  const matches = resolveWritingIssues(text, [issue("teh", "the"), issue("teh", "the", 1), issue("teh", "the", 2), issue("teh", "the", 3), issue("absent", "present"), issue("teh", "the")]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].start, 0);
});
