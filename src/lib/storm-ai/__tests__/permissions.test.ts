import test from "node:test";
import assert from "node:assert/strict";
import { canUseStormAiTool } from "../permissions";

test("technicians can look up customers and the price book", () => {
  for (const tool of [
    "search_customers",
    "get_customer",
    "get_customer_history",
    "search_price_book",
    "search_parts_info",
    "get_active_tech_assist",
  ]) {
    assert.equal(canUseStormAiTool("TECH", tool), true, tool);
  }
});

test("installers cannot look up customers or the price book", () => {
  for (const tool of [
    "search_customers",
    "get_customer",
    "get_customer_history",
    "search_price_book",
    "get_marketing_metrics",
  ]) {
    assert.equal(canUseStormAiTool("INSTALLER", tool), false, tool);
  }
  assert.equal(canUseStormAiTool("INSTALLER", "search_parts_info"), true);
});
