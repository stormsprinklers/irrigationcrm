import test from "node:test";
import assert from "node:assert/strict";
import {
  customerHasLifetimeValueWhere,
  customerHasNoLifetimeValueWhere,
  customerSegmentWhere,
  parseCustomerRecordSegment,
} from "../lifetime-value";

test("parseCustomerRecordSegment accepts only list segments", () => {
  assert.equal(parseCustomerRecordSegment("CUSTOMERS"), "CUSTOMERS");
  assert.equal(parseCustomerRecordSegment("CONTACTS"), "CONTACTS");
  assert.equal(parseCustomerRecordSegment("ALL"), undefined);
  assert.equal(parseCustomerRecordSegment(""), undefined);
});

test("customerSegmentWhere is omitted unless a list segment is chosen", () => {
  assert.equal(customerSegmentWhere(undefined), null);
  assert.deepEqual(customerSegmentWhere("CUSTOMERS"), customerHasLifetimeValueWhere());
  assert.deepEqual(customerSegmentWhere("CONTACTS"), customerHasNoLifetimeValueWhere());
});

test("lifetime value where matches a non-refunded payment on a non-void invoice", () => {
  assert.deepEqual(customerHasLifetimeValueWhere(), {
    invoices: {
      some: {
        status: { not: "VOID" },
        payments: { some: { refundedAt: null } },
      },
    },
  });
  assert.deepEqual(customerHasNoLifetimeValueWhere(), {
    NOT: customerHasLifetimeValueWhere(),
  });
});
