import test from "node:test";
import assert from "node:assert/strict";
import { parseCampaignInstant, resolveCampaignStartAt } from "../campaign-time";

const TZ = "America/Denver";

test("date-only start is 8:00 AM company local, not UTC midnight", () => {
  // 2026-09-10 8:00 AM MDT = 14:00 UTC
  const at = parseCampaignInstant("2026-09-10", TZ);
  assert.equal(at?.toISOString(), "2026-09-10T14:00:00.000Z");
});

test("legacy UTC-midnight ISO is treated as that local date", () => {
  const at = parseCampaignInstant("2026-09-10T00:00:00.000Z", TZ);
  assert.equal(at?.toISOString(), "2026-09-10T14:00:00.000Z");
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

test("resolveCampaignStartAt treats a future sendAt as scheduled", () => {
  const now = new Date("2026-09-10T12:00:00.000Z");
  const future = resolveCampaignStartAt({
    triggerConfig: { sendAt: "2026-09-15T09:00" },
    timeZone: TZ,
    now,
  });
  assert.equal(future.isScheduled, true);
  assert.equal(future.intendedStart.toISOString(), "2026-09-15T15:00:00.000Z");
});

test("resolveCampaignStartAt falls back to drip startAt and ignores past times", () => {
  const now = new Date("2026-09-20T12:00:00.000Z");
  const past = resolveCampaignStartAt({
    dripSettings: { startAt: "2026-09-10T09:00" },
    timeZone: TZ,
    now,
  });
  assert.equal(past.isScheduled, false);
  assert.equal(past.intendedStart.toISOString(), now.toISOString());
});
