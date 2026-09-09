import test from "node:test";
import assert from "node:assert/strict";
import {
  branchMatches,
  parseIfElseConfig,
  pickIfElseNextId,
  remapFlowNextIds,
  type IfElseBranch,
  type IfElseContact,
} from "../if-else";

const contact: IfElseContact = {
  name: "Jane Doe",
  city: "Salt Lake City",
  cities: ["Salt Lake City"],
  companyName: "Acme Co",
  tags: ["vip", "holiday"],
  leadSource: "Google",
  ltv: 250,
  lastAppointmentAt: new Date("2026-08-01T16:00:00.000Z"),
};

function branch(
  partial: Partial<IfElseBranch> & { segments: IfElseBranch["segments"] }
): IfElseBranch {
  return {
    id: "b1",
    nextId: "yes",
    ...partial,
  };
}

test("AND branch requires every condition", () => {
  const ok = branch({
    segments: [
      {
        id: "s1",
        booleanOp: "AND",
        conditions: [
          { id: "1", field: "city", operator: "is", value: "Salt Lake City" },
          { id: "2", field: "ltv", operator: "gt", value: "100" },
        ],
      },
    ],
  });
  assert.equal(branchMatches(contact, ok), true);
  assert.equal(
    branchMatches(contact, {
      ...ok,
      segments: [
        {
          ...ok.segments[0],
          conditions: [
            ...ok.segments[0].conditions,
            { id: "3", field: "leadSource", operator: "is", value: "Yard sign" },
          ],
        },
      ],
    }),
    false
  );
});

test("OR between segments matches if either segment matches", () => {
  const row = branch({
    segments: [
      {
        id: "s1",
        booleanOp: "AND",
        joinOp: "AND",
        conditions: [{ id: "1", field: "city", operator: "is", value: "Lehi" }],
      },
      {
        id: "s2",
        booleanOp: "AND",
        joinOp: "OR",
        conditions: [{ id: "2", field: "tags", operator: "is_any_of", value: "vip" }],
      },
    ],
  });
  assert.equal(branchMatches(contact, row), true);
});

test("AND between segments requires every segment", () => {
  const row = branch({
    segments: [
      {
        id: "s1",
        booleanOp: "AND",
        joinOp: "AND",
        conditions: [{ id: "1", field: "city", operator: "is", value: "Salt Lake City" }],
      },
      {
        id: "s2",
        booleanOp: "AND",
        joinOp: "AND",
        conditions: [{ id: "2", field: "leadSource", operator: "is", value: "Yard sign" }],
      },
    ],
  });
  assert.equal(branchMatches(contact, row), false);
});

test("OR branch accepts any matching condition", () => {
  const row = branch({
    nextId: "or-path",
    segments: [
      {
        id: "s1",
        booleanOp: "OR",
        conditions: [
          { id: "1", field: "city", operator: "is", value: "Lehi" },
          { id: "2", field: "tags", operator: "is_any_of", value: "vip, wholesale" },
        ],
      },
    ],
  });
  assert.equal(branchMatches(contact, row), true);
});

test("pickIfElseNextId uses the first matching branch then None", () => {
  const config = {
    kind: "if_else" as const,
    branches: [
      branch({
        nextId: "slc-vip",
        segments: [
          {
            id: "s1",
            booleanOp: "AND",
            conditions: [
              { id: "1", field: "city", operator: "is", value: "Salt Lake City" },
              { id: "2", field: "ltv", operator: "gt", value: "100" },
            ],
          },
        ],
      }),
    ],
    noneNextId: "none",
  };
  assert.equal(pickIfElseNextId(contact, config), "slc-vip");
  assert.equal(
    pickIfElseNextId({ ...contact, city: "Provo", cities: ["Provo"], ltv: 20 }, config),
    "none"
  );
});

test("contains is case-insensitive and is_empty detects missing city", () => {
  assert.equal(
    branchMatches(
      contact,
      branch({
        segments: [
          {
            id: "s1",
            booleanOp: "AND",
            conditions: [{ id: "1", field: "name", operator: "contains", value: "jane" }],
          },
        ],
      })
    ),
    true
  );
  assert.equal(
    branchMatches(
      { ...contact, city: "", cities: [] },
      branch({
        segments: [
          {
            id: "s1",
            booleanOp: "AND",
            conditions: [{ id: "1", field: "city", operator: "is_empty", value: "" }],
          },
        ],
      })
    ),
    true
  );
});

test("parseIfElseConfig wraps legacy condition lists into a segment", () => {
  const parsed = parseIfElseConfig({
    kind: "if_else",
    branches: [
      {
        id: "old",
        booleanOp: "OR",
        nextId: "next",
        conditions: [{ field: "city", operator: "is", value: "Lehi" }],
      },
    ],
    noneNextId: "none",
  });
  assert.equal(parsed.branches[0].segments[0].booleanOp, "OR");
  assert.equal(parsed.branches[0].segments[0].conditions[0].field, "city");
});

test("city matches property cities and remapFlowNextIds rewrites tmp ids", () => {
  assert.equal(
    branchMatches(
      { ...contact, city: "", cities: ["Draper"] },
      branch({
        segments: [
          {
            id: "s1",
            booleanOp: "AND",
            conditions: [{ id: "1", field: "city", operator: "is", value: "Draper" }],
          },
        ],
      })
    ),
    true
  );
  const remapped = remapFlowNextIds(
    {
      kind: "if_else",
      noneNextId: "tmp-none",
      branches: [{ id: "b1", nextId: "tmp-yes" }],
    },
    new Map([
      ["tmp-none", "real-none"],
      ["tmp-yes", "real-yes"],
    ])
  );
  assert.equal(remapped.noneNextId, "real-none");
  assert.equal((remapped.branches as Array<{ nextId: string }>)[0].nextId, "real-yes");
});
