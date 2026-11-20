import assert from "node:assert/strict";
import test from "node:test";
import {
  canApproveCustomerDeletion,
  canDeleteCustomers,
  canManageCustomers,
  canMergeCustomers,
} from "./permissions";

test("CSRs can delete customers without receiving all customer-management permissions", () => {
  assert.equal(canDeleteCustomers("CSR"), true);
  assert.equal(canManageCustomers("CSR"), false);
});

test("CSRs can merge customers without receiving all customer-management permissions", () => {
  assert.equal(canMergeCustomers("CSR"), true);
  assert.equal(canManageCustomers("CSR"), false);
  assert.equal(canMergeCustomers("TECH"), false);
});

test("only admins can approve deletion of customers with billing history", () => {
  assert.equal(canApproveCustomerDeletion("ADMIN"), true);
  assert.equal(canApproveCustomerDeletion("MANAGER"), false);
  assert.equal(canApproveCustomerDeletion("CSR"), false);
});
