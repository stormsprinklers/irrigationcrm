import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PIPELINE_FOLLOW_UP_SETTINGS,
  isWithinPipelineFollowUpSendWindow,
  normalizePipelineFollowUpSettings,
  pipelineFollowUpAnchorAt,
  renderPipelineTemplate,
} from "../pipeline-followup-settings";

test("pipeline template renderer replaces every supported employee and customer token", () => {
  assert.equal(
    renderPipelineTemplate("Hi {customer first name}, {employee} from {company}. {customer_first_name}!", {
      customerFirstName: "Alex",
      employee: "Jordan Smith",
      company: "Chestnut & Cheer",
    }),
    "Hi Alex, Jordan from Chestnut & Cheer. Alex!"
  );
});

test("resuming a paused customer starts a fresh automation clock", () => {
  const enteredAt = new Date("2026-10-01T12:00:00.000Z");
  const resumedAt = new Date("2026-10-24T18:00:00.000Z");
  assert.equal(pipelineFollowUpAnchorAt(enteredAt, resumedAt), resumedAt);
  assert.equal(pipelineFollowUpAnchorAt(enteredAt, null), enteredAt);
});

test("pipeline settings retain three valid steps and repair invalid delay values", () => {
  const settings = normalizePipelineFollowUpSettings({
    lead: [{ ...DEFAULT_PIPELINE_FOLLOW_UP_SETTINGS.lead[0], delayHours: 0 }],
  });
  assert.equal(settings.lead.length, 3);
  assert.equal(settings.qualified.length, 3);
  assert.equal(settings.lead[0].delayHours, 24);
  assert.equal(settings.qualified[2].delayHours, 168);
});

test("pipeline settings preserve a configured automated sender", () => {
  const settings = normalizePipelineFollowUpSettings({
    senderUserId: "  employee-123  ",
  });

  assert.equal(settings.senderUserId, "employee-123");
});

test("pipeline automation defaults to 8am through 9pm company local time", () => {
  const settings = normalizePipelineFollowUpSettings(null);

  assert.equal(settings.sendWindowStart, "08:00");
  assert.equal(settings.sendWindowEnd, "21:00");
  assert.equal(
    isWithinPipelineFollowUpSendWindow(
      new Date("2026-06-24T13:59:00.000Z"),
      "America/Denver",
      settings
    ),
    false
  );
  assert.equal(
    isWithinPipelineFollowUpSendWindow(
      new Date("2026-06-24T14:00:00.000Z"),
      "America/Denver",
      settings
    ),
    true
  );
  assert.equal(
    isWithinPipelineFollowUpSendWindow(
      new Date("2026-06-25T02:59:00.000Z"),
      "America/Denver",
      settings
    ),
    true
  );
  assert.equal(
    isWithinPipelineFollowUpSendWindow(
      new Date("2026-06-25T03:00:00.000Z"),
      "America/Denver",
      settings
    ),
    false
  );
});

test("pipeline automation repairs invalid or reversed sending hours", () => {
  const settings = normalizePipelineFollowUpSettings({
    sendWindowStart: "22:00",
    sendWindowEnd: "07:00",
  });

  assert.equal(settings.sendWindowStart, "08:00");
  assert.equal(settings.sendWindowEnd, "21:00");
});
