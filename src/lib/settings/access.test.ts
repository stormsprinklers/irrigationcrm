import test from "node:test";
import assert from "node:assert/strict";
import {
  canSearchCrmPage,
  canViewMarketing,
  canViewReporting,
  canViewSettingsNav,
  settingsPathAccess,
} from "./access";

const marketer = { role: "MARKETER" };

test("marketers can view every reporting and marketing route", () => {
  assert.equal(canViewReporting(marketer.role), true);
  assert.equal(canViewMarketing(marketer.role), true);
  assert.equal(canSearchCrmPage("/reporting/voice", marketer), true);
  assert.equal(canSearchCrmPage("/reporting/leads", marketer), true);
  assert.equal(canSearchCrmPage("/reporting/estimates", marketer), true);
  assert.equal(canSearchCrmPage("/marketing", marketer), true);
});

test("marketers do not inherit settings administration", () => {
  assert.equal(canViewSettingsNav(marketer.role), false);
  assert.equal(settingsPathAccess("/settings", marketer), "hidden");
  assert.equal(settingsPathAccess("/settings/employees", marketer), "hidden");
  assert.equal(settingsPathAccess("/settings/integrations", marketer), "hidden");
});
