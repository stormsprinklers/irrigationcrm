import assert from "node:assert/strict";
import test from "node:test";
import { canAccessInvoices, canTakeVisitPayments } from "./permissions";

test("technicians can collect assigned-visit payments without company-wide invoice access", () => {
  assert.equal(canTakeVisitPayments("TECH"), true);
  assert.equal(canTakeVisitPayments("INSTALLER"), true);
  assert.equal(canAccessInvoices("TECH"), false);
  assert.equal(canAccessInvoices("INSTALLER"), false);
});

test("office billing roles retain visit payment access", () => {
  for (const role of ["ADMIN", "MANAGER", "CSR"]) {
    assert.equal(canTakeVisitPayments(role), true);
  }
  assert.equal(canTakeVisitPayments("SALES"), false);
  assert.equal(canTakeVisitPayments("MARKETER"), false);
});
