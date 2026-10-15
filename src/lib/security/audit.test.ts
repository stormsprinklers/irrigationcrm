import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeSecurityMetadata } from "./audit";

test("security audit metadata removes credential and content fields", () => {
  assert.deepEqual(
    sanitizeSecurityMetadata({
      reason: "invalid",
      password: "never-log-this",
      accessToken: "never-log-this",
      requestBody: "never-log-this",
      attempts: 2,
    }),
    { reason: "invalid", attempts: 2 }
  );
});

test("security audit metadata bounds string values", () => {
  const result = sanitizeSecurityMetadata({ detail: "x".repeat(400) });
  assert.equal(result?.detail?.toString().length, 255);
});
