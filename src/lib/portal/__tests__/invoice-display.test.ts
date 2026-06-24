import test from "node:test";
import assert from "node:assert/strict";
import { getPortalInvoiceDisplay } from "../invoice-display";

test("paid invoices are not payable", () => {
  const display = getPortalInvoiceDisplay({ status: "PAID", balanceDue: 0 });
  assert.equal(display.isPayable, false);
  assert.equal(display.statusLabel, "Paid");
});

test("refunded invoices are not payable", () => {
  const display = getPortalInvoiceDisplay({ status: "REFUNDED", balanceDue: 150 });
  assert.equal(display.isPayable, false);
  assert.equal(display.statusLabel, "Refunded");
});

test("open balance invoices are payable", () => {
  const display = getPortalInvoiceDisplay({ status: "SENT", balanceDue: 75.5 });
  assert.equal(display.isPayable, true);
  assert.equal(display.statusLabel, "Due");
});
