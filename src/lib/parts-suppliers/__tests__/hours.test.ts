import test from "node:test";
import assert from "node:assert/strict";
import { isSupplierOpenNow } from "../hours";

test("isSupplierOpenNow uses openNow when provided", () => {
  assert.equal(isSupplierOpenNow({ openNow: true }, "America/Denver"), true);
  assert.equal(isSupplierOpenNow({ openNow: false }, "America/Denver"), false);
});

test("isSupplierOpenNow defaults open when no hours", () => {
  assert.equal(isSupplierOpenNow(null, "America/Denver"), true);
});
