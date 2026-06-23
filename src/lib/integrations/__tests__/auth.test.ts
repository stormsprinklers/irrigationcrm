import test from "node:test";
import assert from "node:assert/strict";
import { extractIntegrationKey, hashIntegrationKey } from "../keys";

test("extractIntegrationKey reads bearer token", () => {
  const req = new Request("http://localhost", {
    headers: { Authorization: "Bearer crm_int_test123" },
  });
  assert.equal(extractIntegrationKey(req), "crm_int_test123");
});

test("hashIntegrationKey is stable", () => {
  assert.equal(hashIntegrationKey("crm_int_a"), hashIntegrationKey("crm_int_a"));
});
