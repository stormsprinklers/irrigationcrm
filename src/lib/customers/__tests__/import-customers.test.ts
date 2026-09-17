import test from "node:test";
import assert from "node:assert/strict";
import { parseCustomerImportCsv } from "../import-csv";
import { sameAddress, validCustomerName } from "../import-matching";

test("rejects missing, numeric, and placeholder names while accepting real names", () => {
  for (const value of ["", "  ", "123456", "Unknown", "N/A", "Customer 17"]) {
    assert.equal(validCustomerName(value), false, value);
  }
  assert.equal(validCustomerName("John A. Doe"), true);
  assert.equal(validCustomerName("ABC Property Management"), true);
});

test("matches equivalent addresses and rejects conflicting cities or ZIP codes", () => {
  const incoming = { address: "123 Main Street", city: "Denver", state: "CO", zip: "80202" };
  assert.equal(sameAddress(incoming, { address: "123 Main St.", city: "denver", state: "CO", zip: "80202" }), true);
  assert.equal(sameAddress(incoming, { address: "123 Main St", city: "Boulder", state: "CO", zip: "80202" }), false);
  assert.equal(sameAddress(incoming, { address: "123 Main St", city: "Denver", state: "CO", zip: "80301" }), false);
});

test("CSV template parses quoted names, secondary contacts, and opt-outs", () => {
  const rows = parseCustomerImportCsv('Name,Address,City,Phone,Secondary Phones,Email,Secondary Emails,Tags,Marketing SMS Opt Out\n"Doe, Jane",123 Main St,Denver,5551234567,"5557654321; 5559991111",jane@example.com,jane.other@example.com,"spring;vip",yes');
  assert.equal(rows[0].name, "Doe, Jane");
  assert.deepEqual(rows[0].phones, ["5557654321", "5559991111"]);
  assert.deepEqual(rows[0].emails, ["jane.other@example.com"]);
  assert.equal(rows[0].marketingSmsOptOut, true);
});
