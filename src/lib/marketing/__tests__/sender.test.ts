import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveMarketingSenderName,
  sanitizeMarketingSenderName,
  withSanitizedCampaignSenderName,
} from "../sender";

test("sanitizeMarketingSenderName trims, collapses space, and caps length", () => {
  assert.equal(sanitizeMarketingSenderName("  Austin Green  "), "Austin Green");
  assert.equal(sanitizeMarketingSenderName("Austin\nGreen"), "Austin Green");
  assert.equal(sanitizeMarketingSenderName("   "), null);
  assert.equal(sanitizeMarketingSenderName(12), null);
  assert.equal(sanitizeMarketingSenderName("A".repeat(100))?.length, 78);
});

test("campaign override wins over company sender name", () => {
  assert.equal(
    resolveMarketingSenderName({
      dripSettings: { senderName: "Austin Green" },
      companySenderName: "Storm Sprinklers",
      companyName: "Storm Sprinklers",
    }),
    "Austin Green"
  );
});

test("blank campaign sender falls back to company then business name", () => {
  assert.equal(
    resolveMarketingSenderName({
      dripSettings: { senderName: "   " },
      companySenderName: "Storm Sprinklers",
      companyName: "Storm LLC",
    }),
    "Storm Sprinklers"
  );
  assert.equal(
    resolveMarketingSenderName({
      dripSettings: {},
      companySenderName: null,
      companyName: "Storm Sprinklers",
    }),
    "Storm Sprinklers"
  );
});

test("withSanitizedCampaignSenderName drops empty override", () => {
  assert.deepEqual(
    withSanitizedCampaignSenderName({ emailsPerDay: 50, senderName: "  Austin Green  " }),
    { emailsPerDay: 50, senderName: "Austin Green" }
  );
  assert.deepEqual(withSanitizedCampaignSenderName({ emailsPerDay: 50, senderName: "  " }), {
    emailsPerDay: 50,
  });
});
