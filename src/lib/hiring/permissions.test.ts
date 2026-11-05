import test from "node:test";
import assert from "node:assert/strict";
import {
  applicantQualifiesForBookingInvite,
  stageFromAiScore,
} from "./permissions";

test("booking invitations require a finite score of at least 6", () => {
  assert.equal(applicantQualifiesForBookingInvite("MAYBE", null, "AI"), false);
  assert.equal(applicantQualifiesForBookingInvite("MAYBE", undefined, "AI"), false);
  assert.equal(applicantQualifiesForBookingInvite("MAYBE", Number.NaN, "AI"), false);
  assert.equal(applicantQualifiesForBookingInvite("MAYBE", 0, "AI"), false);
  assert.equal(applicantQualifiesForBookingInvite("MAYBE", 5, "AI"), false);
  assert.equal(applicantQualifiesForBookingInvite("MAYBE", 6, "AI"), true);
  assert.equal(applicantQualifiesForBookingInvite("GOOD_FIT", 12, "AI"), true);
});

test("a manual move to maybe or good fit overrides the score cutoff", () => {
  assert.equal(applicantQualifiesForBookingInvite("MAYBE", 0, "MANUAL"), true);
  assert.equal(applicantQualifiesForBookingInvite("GOOD_FIT", null, "MANUAL"), true);
});

test("rejected applicants never receive booking invitations", () => {
  assert.equal(applicantQualifiesForBookingInvite("REJECTED", 12, "AI"), false);
  assert.equal(applicantQualifiesForBookingInvite("REJECTED", 12, "MANUAL"), false);
});

test("score stages keep the invitation cutoff at six", () => {
  assert.equal(stageFromAiScore(0), "REJECTED");
  assert.equal(stageFromAiScore(5), "REJECTED");
  assert.equal(stageFromAiScore(6), "MAYBE");
  assert.equal(stageFromAiScore(9), "MAYBE");
  assert.equal(stageFromAiScore(10), "GOOD_FIT");
});
