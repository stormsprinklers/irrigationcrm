import assert from "node:assert/strict";
import test from "node:test";
import { resolveEstimateInvoiceBalance } from "../estimate-invoice-amount";

test("defaults to the full remaining balance", () => {
  assert.deepEqual(resolveEstimateInvoiceBalance(1625), { ok: true, amount: 1625 });
});

test("calculates a percentage of the remaining balance", () => {
  assert.deepEqual(
    resolveEstimateInvoiceBalance(1625, { type: "PERCENT", value: 50 }),
    { ok: true, amount: 812.5 }
  );
});

test("accepts an exact partial invoice amount", () => {
  assert.deepEqual(
    resolveEstimateInvoiceBalance(1625, { type: "FIXED", value: 5 }),
    { ok: true, amount: 5 }
  );
});

test("rejects amounts above the remaining balance", () => {
  const result = resolveEstimateInvoiceBalance(100, { type: "FIXED", value: 100.01 });
  assert.equal(result.ok, false);
  assert.match(result.error, /cannot exceed/i);
});

test("rejects percentages above 100", () => {
  const result = resolveEstimateInvoiceBalance(100, { type: "PERCENT", value: 101 });
  assert.equal(result.ok, false);
  assert.match(result.error, /cannot exceed 100%/i);
});
