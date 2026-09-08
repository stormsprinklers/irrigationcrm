import test from "node:test";
import assert from "node:assert/strict";
import { addTagSummary, mergeCustomerTags, parseAddTagConfig } from "../add-tag";

test("parseAddTagConfig accepts a list and a single tag without duplicates", () => {
  assert.deepEqual(parseAddTagConfig({ tags: ["vip", " VIP ", ""], tag: "holiday" }), [
    "vip",
    "holiday",
  ]);
  assert.deepEqual(parseAddTagConfig({}), []);
});

test("addTagSummary lists selected tags", () => {
  assert.equal(addTagSummary({ tags: ["vip"] }), "Add tag · vip");
  assert.equal(addTagSummary({}), "Add tag");
});

test("mergeCustomerTags skips tags the customer already has", () => {
  assert.deepEqual(mergeCustomerTags(["VIP", "lead"], ["vip", "holiday"]), ["VIP", "lead", "holiday"]);
});
