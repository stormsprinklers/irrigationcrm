import test from "node:test";
import assert from "node:assert/strict";
import { defaultEstimateVisitTitle } from "../visit-title";

test("holiday lighting estimates create installation visits", () => {
  assert.equal(
    defaultEstimateVisitTitle({ source: "holiday-lighting-quote", quoteId: "quote-1" }),
    "Holiday Lighting Installation"
  );
});

test("ordinary estimates create service visits", () => {
  assert.equal(defaultEstimateVisitTitle(null), "Service Visit");
  assert.equal(defaultEstimateVisitTitle({ source: "irrigation-design" }), "Service Visit");
});
