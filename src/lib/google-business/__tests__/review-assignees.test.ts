import test from "node:test";
import assert from "node:assert/strict";
import { UserRole } from "@prisma/client";
import {
  REVIEW_ALIAS_ROLES,
  REVIEW_MANUAL_ASSIGNMENT_ROLES,
} from "../review-aliases";

test("manual Google review credit supports every human employee role", () => {
  assert.deepEqual(
    new Set(REVIEW_MANUAL_ASSIGNMENT_ROLES),
    new Set(Object.values(UserRole))
  );
});

test("automatic name matching remains limited to field roles", () => {
  assert.deepEqual(new Set(REVIEW_ALIAS_ROLES), new Set([UserRole.TECH, UserRole.INSTALLER]));
});
