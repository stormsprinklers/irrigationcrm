import test from "node:test";
import assert from "node:assert/strict";
import { parseCampaignInstant } from "../campaign-time";

const TZ = "America/Denver";

test("date-only start is 5:00 AM company local, not UTC midnight", () => {
  // 2026-09-10 5:00 AM MDT = 11:00 UTC
  const at = parseCampaignInstant("2026-09-10", TZ);
  assert.equal(at?.toISOString(), "2026-09-10T11:00:00.000Z");
});

test("legacy UTC-midnight ISO is treated as that local date", () => {
  const at = parseCampaignInstant("2026-09-10T00:00:00.000Z", TZ);
  assert.equal(at?.toISOString(), "2026-09-10T11:00:00.000Z");
});

test("datetime-local without zone uses company wall clock", () => {
  // 9:00 AM MDT Sep 10 = 15:00 UTC
  const at = parseCampaignInstant("2026-09-10T09:00", TZ);
  assert.equal(at?.toISOString(), "2026-09-10T15:00:00.000Z");
});

test("explicit UTC ISO stays an absolute instant", () => {
  const at = parseCampaignInstant("2026-09-10T15:00:00.000Z", TZ);
  assert.equal(at?.toISOString(), "2026-09-10T15:00:00.000Z");
});
