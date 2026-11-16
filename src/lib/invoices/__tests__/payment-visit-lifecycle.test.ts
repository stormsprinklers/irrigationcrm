import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("recording payment never completes the related visit", () => {
  const source = readFileSync(new URL("../record-payment.ts", import.meta.url), "utf8");

  assert.doesNotMatch(source, /prisma\.visit\.update\s*\(/);
  assert.doesNotMatch(source, /assertVisitCanComplete/);
});
