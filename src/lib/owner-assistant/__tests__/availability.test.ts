import assert from "node:assert/strict";
import test from "node:test";
import { isOwnerAssistantAvailable, parseOwnerAssistantAvailability } from "../availability";
import { OWNER_ASSISTANT_TOOL_NAMES, OWNER_ASSISTANT_TOOLS } from "../types";

test("availability defaults safely to always", () => {
  assert.deepEqual(parseOwnerAssistantAvailability(null), { mode: "ALWAYS" });
});

test("custom availability observes local weekday and time", () => {
  const schedule = { mode: "CUSTOM", timeZone: "America/Denver", days: [4], start: "08:00", end: "18:00" };
  assert.equal(isOwnerAssistantAvailable(schedule, new Date("2026-10-15T16:00:00Z")), true);
  assert.equal(isOwnerAssistantAvailable(schedule, new Date("2026-10-16T03:00:00Z")), false);
});

test("tool allowlist excludes money, communications, and admin controls", () => {
  const tools = new Set<string>(OWNER_ASSISTANT_TOOL_NAMES);
  for (const prohibited of ["send_sms", "place_call", "send_email", "refund_payment", "create_payment", "change_role", "delete_customer"]) {
    assert.equal(tools.has(prohibited), false);
  }
});

test("tool allowlist includes confirmation-gated appointment changes", () => {
  const tools = new Set<string>(OWNER_ASSISTANT_TOOL_NAMES);
  assert.equal(tools.has("resolve_visit_time"), true);
  assert.equal(tools.has("reschedule_visit"), true);
  assert.equal(tools.has("cancel_visit"), true);

  for (const name of ["reschedule_visit", "cancel_visit"]) {
    const tool = OWNER_ASSISTANT_TOOLS.find((candidate) => candidate.name === name);
    assert.ok(tool);
    assert.equal(tool.parameters.required.includes("confirmed"), true);
    assert.equal("confirmed" in tool.parameters.properties, true);
  }
});
