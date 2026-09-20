import test from "node:test";
import assert from "node:assert/strict";
import {
  clampToAutomatedSendWindow,
  clampToCampaignInitialOutreachWindow,
  clampToCampaignSendWindow,
  isWithinAutomatedSendWindow,
  isWithinCampaignInitialOutreachWindow,
  isWithinCampaignSendWindow,
  nextAutomatedSendWindowStart,
  nextCampaignSendWindowStart,
} from "../send-window";

const TZ = "America/Denver";

test("isWithinAutomatedSendWindow allows 5am–8:59pm Mountain", () => {
  // 2026-06-24 5:00 AM MDT = 11:00 UTC
  assert.equal(
    isWithinAutomatedSendWindow(new Date("2026-06-24T11:00:00.000Z"), TZ),
    true
  );
  // 8:59 PM MDT = 02:59 UTC next day
  assert.equal(
    isWithinAutomatedSendWindow(new Date("2026-06-25T02:59:00.000Z"), TZ),
    true
  );
  // 9:00 PM MDT = 03:00 UTC
  assert.equal(
    isWithinAutomatedSendWindow(new Date("2026-06-25T03:00:00.000Z"), TZ),
    false
  );
  // 4:59 AM MDT = 10:59 UTC
  assert.equal(
    isWithinAutomatedSendWindow(new Date("2026-06-24T10:59:00.000Z"), TZ),
    false
  );
});

test("nextAutomatedSendWindowStart holds overnight until 5am", () => {
  // 10:00 PM MDT Jun 24 → 5:00 AM Jun 25
  const at = new Date("2026-06-25T04:00:00.000Z");
  const next = nextAutomatedSendWindowStart(at, TZ);
  assert.equal(next.toISOString(), "2026-06-25T11:00:00.000Z");
});

test("nextAutomatedSendWindowStart from early morning is same-day 5am", () => {
  // 2:00 AM MDT Jun 24 → 5:00 AM jun 24
  const at = new Date("2026-06-24T08:00:00.000Z");
  const next = nextAutomatedSendWindowStart(at, TZ);
  assert.equal(next.toISOString(), "2026-06-24T11:00:00.000Z");
});

test("clampToAutomatedSendWindow leaves daytime unchanged", () => {
  const at = new Date("2026-06-24T18:00:00.000Z"); // noon MDT
  assert.equal(clampToAutomatedSendWindow(at, TZ).toISOString(), at.toISOString());
});

test("campaign window blocks 9pm–8am and resumes at 8am", () => {
  // 7:59 AM MDT = 13:59 UTC — still quiet hours
  assert.equal(
    isWithinCampaignSendWindow(new Date("2026-06-24T13:59:00.000Z"), TZ),
    false
  );
  // 8:00 AM MDT = 14:00 UTC
  assert.equal(
    isWithinCampaignSendWindow(new Date("2026-06-24T14:00:00.000Z"), TZ),
    true
  );
  // 8:59 PM MDT = 02:59 UTC next day
  assert.equal(
    isWithinCampaignSendWindow(new Date("2026-06-25T02:59:00.000Z"), TZ),
    true
  );
  // 9:00 PM MDT = 03:00 UTC
  assert.equal(
    isWithinCampaignSendWindow(new Date("2026-06-25T03:00:00.000Z"), TZ),
    false
  );

  // 10:00 PM MDT Jun 24 → 8:00 AM Jun 25
  const overnight = new Date("2026-06-25T04:00:00.000Z");
  assert.equal(
    nextCampaignSendWindowStart(overnight, TZ).toISOString(),
    "2026-06-25T14:00:00.000Z"
  );

  // 2:00 AM MDT Jun 24 → 8:00 AM Jun 24
  const early = new Date("2026-06-24T08:00:00.000Z");
  assert.equal(
    clampToCampaignSendWindow(early, TZ).toISOString(),
    "2026-06-24T14:00:00.000Z"
  );
});

test("campaign window runs on Saturday and Sunday", () => {
  // Saturday, Sep 19 2026 at 8:00 AM MDT.
  assert.equal(
    isWithinCampaignSendWindow(new Date("2026-09-19T14:00:00.000Z"), TZ),
    true
  );
  // Sunday, Sep 20 2026 at 8:00 AM MDT.
  assert.equal(
    isWithinCampaignSendWindow(new Date("2026-09-20T14:00:00.000Z"), TZ),
    true
  );
  // Saturday at 9:00 PM holds until Sunday at 8:00 AM.
  assert.equal(
    nextCampaignSendWindowStart(new Date("2026-09-20T03:00:00.000Z"), TZ).toISOString(),
    "2026-09-20T14:00:00.000Z"
  );
});

test("initial campaign outreach pauses on Sunday while follow-ups remain allowed", () => {
  const saturdayMorning = new Date("2026-09-19T14:00:00.000Z");
  const saturdayNight = new Date("2026-09-20T03:00:00.000Z");
  const sundayMorning = new Date("2026-09-20T14:00:00.000Z");

  assert.equal(isWithinCampaignInitialOutreachWindow(saturdayMorning, TZ), true);
  assert.equal(isWithinCampaignInitialOutreachWindow(sundayMorning, TZ), false);
  assert.equal(isWithinCampaignSendWindow(sundayMorning, TZ), true);
  assert.equal(
    clampToCampaignInitialOutreachWindow(sundayMorning, TZ).toISOString(),
    "2026-09-21T14:00:00.000Z"
  );
  assert.equal(
    clampToCampaignInitialOutreachWindow(saturdayNight, TZ).toISOString(),
    "2026-09-21T14:00:00.000Z"
  );
});
