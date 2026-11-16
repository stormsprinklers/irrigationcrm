import assert from "node:assert/strict";
import test from "node:test";
import { buildCallHistorySearchWhere } from "./call-history-search";

test("call history search ignores blank input", () => {
  assert.equal(buildCallHistorySearchWhere("   "), undefined);
});

test("call history search includes customer and employee names", () => {
  const serialized = JSON.stringify(buildCallHistorySearchWhere("Jane Smith"));
  assert.match(serialized, /customer/);
  assert.match(serialized, /handledBy/);
  assert.match(serialized, /Jane Smith/);
});

test("call history search normalizes formatted phone numbers", () => {
  const serialized = JSON.stringify(buildCallHistorySearchWhere("(801) 555-1212"));
  assert.match(serialized, /8015551212/);
  assert.match(serialized, /fromNumber/);
  assert.match(serialized, /toNumber/);
});
