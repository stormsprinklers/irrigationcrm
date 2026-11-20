import assert from "node:assert/strict";
import test from "node:test";
import { customerDeletionNeedsAdminApproval } from "./delete";

test("customers without invoices do not require admin deletion", () => {
  assert.equal(customerDeletionNeedsAdminApproval(0, false), false);
});

test("invoice history requires explicit admin deletion", () => {
  assert.equal(customerDeletionNeedsAdminApproval(1, false), true);
  assert.equal(customerDeletionNeedsAdminApproval(3, true), false);
});
