import test from "node:test";
import assert from "node:assert/strict";
import {
  optionMatches,
  optionPublicLabel,
  phrasesOverlap,
  resolveNextFromDiagnostic,
  spokenYesNo,
  type TechAssistOption,
} from "../tech-assist";

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

test("spokenYesNo maps field paraphrases", () => {
  assert.equal(spokenYesNo("yes"), "yes");
  assert.equal(spokenYesNo("the valve operated manually"), "yes");
  assert.equal(spokenYesNo("it opens"), "yes");
  assert.equal(spokenYesNo("no"), "no");
  assert.equal(spokenYesNo("it didn't operate manually"), "no");
  assert.equal(spokenYesNo("water pressure is fine"), null);
});

test("phrasesOverlap tolerates tense differences", () => {
  assert.equal(phrasesOverlap("valve operates manually", "the valve operated manually"), true);
  assert.equal(phrasesOverlap("solenoid ohms", "controller voltage"), false);
});

test("yes option matches spoken valve-manual answer", () => {
  const yes: TechAssistOption = {
    id: "y",
    label: "Yes",
    match: "yes",
    nextNodeId: "next-yes",
  };
  const no: TechAssistOption = {
    id: "n",
    label: "No",
    match: "no",
    nextNodeId: "next-no",
  };
  assert.equal(optionMatches(yes, "the valve operated manually"), true);
  assert.equal(optionMatches(no, "the valve operated manually"), false);
  assert.equal(optionMatches(yes, "yeah it does"), true);
});

test("label option matches paraphrased spoken reply", () => {
  const option: TechAssistOption = {
    id: "1",
    label: "Valve operates manually",
    match: "label",
    nextNodeId: "next",
  };
  assert.equal(optionMatches(option, "the valve operated manually"), true);
  assert.equal(optionMatches(option, "controller is dead"), false);
});

test("resolveNextFromDiagnostic does not invent a next step on unmatched options", () => {
  const resolved = resolveNextFromDiagnostic(
    {
      options: [
        { id: "y", label: "Yes", match: "yes", nextNodeId: "a" },
        { id: "n", label: "No", match: "no", nextNodeId: "b" },
      ],
    },
    "check the water pressure at the valve"
  );
  assert.equal(resolved.matched, false);
  assert.equal(resolved.nextNodeId, null);
});

test("resolveNextFromDiagnostic advances on spoken yes", () => {
  const resolved = resolveNextFromDiagnostic(
    {
      options: [
        { id: "y", label: "Yes", match: "yes", nextNodeId: "a" },
        { id: "n", label: "No", match: "no", nextNodeId: "b" },
      ],
    },
    "valve operated manually"
  );
  assert.equal(resolved.matched, true);
  assert.equal(resolved.nextNodeId, "a");
});
