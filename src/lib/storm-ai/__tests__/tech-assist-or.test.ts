import test from "node:test";
import assert from "node:assert/strict";
import { optionMatches, optionPublicLabel, type TechAssistOption } from "../tech-assist";

test("optionMatches accepts either primary or OR alternative", () => {
  const option: TechAssistOption = {
    id: "1",
    label: "Open",
    match: "label",
    anyOf: [{ match: "label", label: "OL" }],
    nextNodeId: "next",
  };
  assert.equal(optionMatches(option, "open"), true);
  assert.equal(optionMatches(option, "OL"), true);
  assert.equal(optionMatches(option, "closed"), false);
});

test("optionMatches OR can use a different match type", () => {
  const option: TechAssistOption = {
    id: "1",
    label: "High",
    match: "gt",
    value: 50,
    anyOf: [{ match: "yes" }],
    nextNodeId: "next",
  };
  assert.equal(optionMatches(option, 80), true);
  assert.equal(optionMatches(option, "yes"), true);
  assert.equal(optionMatches(option, 10), false);
});

test("optionPublicLabel includes OR alternatives", () => {
  assert.equal(
    optionPublicLabel({
      id: "1",
      label: "Open",
      match: "label",
      anyOf: [{ match: "label", label: "OL" }],
    }),
    "Open OR OL"
  );
});
