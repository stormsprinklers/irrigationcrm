import assert from "node:assert/strict";
import test from "node:test";
import { parseVisitContractorCostItems } from "../job-costs";

test("visit job costs prefer editable overrides over the estimate contractor snapshot", () => {
  const items = parseVisitContractorCostItems({
    contractorCostItems: [{ id: "bulbs", name: "Bulbs", quantity: 100, unitCost: 0.4 }],
    jobCostItems: [{ id: "actual-bulbs", name: "Actual bulbs used", quantity: 110, unitCost: 0.45 }],
  });

  assert.deepEqual(items, [{
    id: "actual-bulbs",
    name: "Actual bulbs used",
    quantity: 110,
    unitCost: 0.45,
    total: 49.5,
  }]);
});

test("visit job costs fall back to the approved estimate contractor items", () => {
  const items = parseVisitContractorCostItems({
    contractorCostItems: [{ id: "timer", name: "Timer", quantity: 2, unitCost: 18.5 }],
  });

  assert.equal(items[0]?.total, 37);
});
