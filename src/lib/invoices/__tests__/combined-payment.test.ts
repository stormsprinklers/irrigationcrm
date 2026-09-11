import test from "node:test";
import assert from "node:assert/strict";
import { allocateCombinedPayment, parseCombinedInvoiceMetadata } from "../combined-payment";

test("allocateCombinedPayment applies each invoice balance", () => {
  assert.deepEqual(
    allocateCombinedPayment(
      [
        { id: "a", balanceDue: 40 },
        { id: "b", balanceDue: 60 },
      ],
      100
    ),
    [
      { invoiceId: "a", amount: 40 },
      { invoiceId: "b", amount: 60 },
    ]
  );
});

test("allocateCombinedPayment caps at live balances if one was paid", () => {
  assert.deepEqual(
    allocateCombinedPayment(
      [
        { id: "a", balanceDue: 0 },
        { id: "b", balanceDue: 60 },
      ],
      100,
      [
        { id: "a", amount: 40 },
        { id: "b", amount: 60 },
      ]
    ),
    [{ invoiceId: "b", amount: 60 }]
  );
});

test("allocateCombinedPayment uses leftover on remaining invoices", () => {
  assert.deepEqual(
    allocateCombinedPayment(
      [
        { id: "a", balanceDue: 25 },
        { id: "b", balanceDue: 80 },
      ],
      100,
      [
        { id: "a", amount: 40 },
        { id: "b", amount: 60 },
      ]
    ),
    [
      { invoiceId: "a", amount: 25 },
      { invoiceId: "b", amount: 75 },
    ]
  );
});

test("parseCombinedInvoiceMetadata reads checkout metadata", () => {
  const parsed = parseCombinedInvoiceMetadata({
    checkoutType: "multi_invoice",
    invoiceIds: "inv1,inv2",
    amountsCents: "4000,6000",
    companyId: "co1",
  });
  assert.deepEqual(parsed, {
    companyId: "co1",
    customerId: null,
    planned: [
      { id: "inv1", amount: 40 },
      { id: "inv2", amount: 60 },
    ],
  });
});
