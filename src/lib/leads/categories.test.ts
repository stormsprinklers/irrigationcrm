import assert from "node:assert/strict";
import test from "node:test";
import { isGivingLeadSource } from "./categories";

test("identifies Share the Cheer submissions as giving leads", () => {
  assert.equal(isGivingLeadSource("share-the-cheer-nomination"), true);
  assert.equal(isGivingLeadSource(" SHARE-THE-CHEER-PARTNER "), true);
});

test("does not classify normal sales sources as giving leads", () => {
  assert.equal(isGivingLeadSource("website"), false);
  assert.equal(isGivingLeadSource(null), false);
});

