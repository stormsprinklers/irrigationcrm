import test from "node:test";
import assert from "node:assert/strict";
import { matchOwnerAssistantEmployee } from "../employee-resolution";

const employees = [
  { id: "one", name: "Riley Green", email: "riley@example.com" },
  { id: "two", name: "Taylor Smith", email: "taylor@example.com" },
  { id: "three", name: "Taylor Jones", email: "tjones@example.com" },
];

test("employee names resolve case-insensitively without exposing IDs to the owner", () => {
  assert.deepEqual(matchOwnerAssistantEmployee(employees, "  riley   green "), {
    ok: true,
    employee: employees[0],
  });
});

test("a unique partial employee name resolves but ambiguous names do not", () => {
  assert.deepEqual(matchOwnerAssistantEmployee(employees, "Smith"), {
    ok: true,
    employee: employees[1],
  });
  assert.deepEqual(matchOwnerAssistantEmployee(employees, "Taylor"), {
    ok: false,
    reason: "AMBIGUOUS",
  });
});

test("unknown employee names return not found", () => {
  assert.deepEqual(matchOwnerAssistantEmployee(employees, "Nobody Here"), {
    ok: false,
    reason: "NOT_FOUND",
  });
});
