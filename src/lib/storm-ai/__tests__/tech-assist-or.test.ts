import test from "node:test";
import assert from "node:assert/strict";
import { TechAssistNodeType } from "@prisma/client";
import {
  applyKnownFactsAlongPath,
  consumeMatchedFacts,
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

test("consumeMatchedFacts strips the answered topic so later steps see remaining facts", () => {
  const remaining = consumeMatchedFacts(
    "the valve operated manually and the solenoid shows 30 ohms",
    { id: "y", label: "Yes", match: "yes", nextNodeId: "next" },
    { title: "Manual operate", body: "Does the valve operate manually?" }
  );
  assert.match(remaining, /solenoid/i);
  assert.match(remaining, /30/);
  assert.doesNotMatch(remaining, /valve/i);
  assert.doesNotMatch(remaining, /operat/i);
});

test("applyKnownFactsAlongPath fast-forwards past answered diagnostics", () => {
  const nodes = [
    {
      id: "d1",
      type: TechAssistNodeType.DIAGNOSTIC,
      title: "Manual",
      body: "Does the valve operate manually?",
      sortOrder: 0,
      config: {
        options: [
          { id: "y", label: "Yes", match: "yes" as const, nextNodeId: "d2" },
          { id: "n", label: "No", match: "no" as const, nextNodeId: "r-bad" },
        ],
      },
    },
    {
      id: "d2",
      type: TechAssistNodeType.DIAGNOSTIC,
      title: "Solenoid ohms",
      body: "Measure ohms across the solenoid leads",
      sortOrder: 1,
      config: {
        options: [
          {
            id: "ok",
            label: "20-60",
            match: "between" as const,
            min: 20,
            max: 60,
            nextNodeId: "d3",
          },
          {
            id: "bad",
            label: "open",
            match: "label" as const,
            nextNodeId: "r-bad",
          },
        ],
      },
    },
    {
      id: "d3",
      type: TechAssistNodeType.DIAGNOSTIC,
      title: "Wiring",
      body: "Check common and zone wire continuity",
      sortOrder: 2,
      config: {
        options: [
          { id: "y", label: "Yes", match: "yes" as const, nextNodeId: "r-ok" },
          { id: "n", label: "No", match: "no" as const, nextNodeId: "r-bad" },
        ],
      },
    },
    {
      id: "r-ok",
      type: TechAssistNodeType.RESOLUTION,
      title: "Replace valve",
      body: "Replace the valve",
      sortOrder: 3,
      config: {},
    },
    {
      id: "r-bad",
      type: TechAssistNodeType.RESOLUTION,
      title: "Other",
      body: "Other fix",
      sortOrder: 4,
      config: {},
    },
  ];

  const sought = applyKnownFactsAlongPath(
    nodes,
    "d1",
    "valve operated manually and the solenoid shows 30 ohms"
  );

  assert.equal(sought.stepsApplied, 2);
  assert.equal(sought.node?.id, "d3");
  assert.deepEqual(
    sought.history.map((h) => h.nodeId),
    ["d1", "d2"]
  );
});

test("applyKnownFactsAlongPath stops when facts do not answer the current step", () => {
  const nodes = [
    {
      id: "d1",
      type: TechAssistNodeType.DIAGNOSTIC,
      title: "Manual",
      body: "Does the valve operate manually?",
      sortOrder: 0,
      config: {
        options: [
          { id: "y", label: "Yes", match: "yes" as const, nextNodeId: "d2" },
          { id: "n", label: "No", match: "no" as const, nextNodeId: "r1" },
        ],
      },
    },
    {
      id: "d2",
      type: TechAssistNodeType.DIAGNOSTIC,
      title: "Next",
      body: "Something else",
      sortOrder: 1,
      config: {
        options: [
          { id: "y", label: "Yes", match: "yes" as const, nextNodeId: "r1" },
        ],
      },
    },
    {
      id: "r1",
      type: TechAssistNodeType.RESOLUTION,
      title: "Done",
      body: "Done",
      sortOrder: 2,
      config: {},
    },
  ];

  const sought = applyKnownFactsAlongPath(nodes, "d1", "the controller display is blank");
  assert.equal(sought.stepsApplied, 0);
  assert.equal(sought.node?.id, "d1");
});
