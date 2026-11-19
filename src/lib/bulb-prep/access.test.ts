import assert from "node:assert/strict";
import test from "node:test";
import { bulbPrepPathAllowed } from "@/lib/bulb-prep/access";

test("Bulb Prep access is limited to its dashboard and supporting APIs", () => {
  assert.equal(bulbPrepPathAllowed("/home"), true);
  assert.equal(bulbPrepPathAllowed("/api/time-clock"), true);
  assert.equal(bulbPrepPathAllowed("/api/bulb-prep/jobs"), true);
  assert.equal(bulbPrepPathAllowed("/api/settings/company/branding"), true);
  assert.equal(bulbPrepPathAllowed("/api/auth/session"), true);
  assert.equal(bulbPrepPathAllowed("/api/integrations/website/leads"), false);
  assert.equal(bulbPrepPathAllowed("/api/cron/notifications"), false);
  assert.equal(bulbPrepPathAllowed("/customers"), false);
  assert.equal(bulbPrepPathAllowed("/api/customers"), false);
  assert.equal(bulbPrepPathAllowed("/settings/employees"), false);
});
