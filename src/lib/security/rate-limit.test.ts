import test from "node:test";
import assert from "node:assert/strict";
import { buildRateLimitKey, requestClientAddress } from "./rate-limit";

test("rate-limit keys are stable hashes without raw identity data", () => {
  const key = buildRateLimitKey("login", "Admin@Example.com");
  assert.equal(key, buildRateLimitKey("login", "admin@example.com"));
  assert.equal(key.length, 64);
  assert.equal(key.includes("example.com"), false);
});

test("client address uses the first trusted forwarded value", () => {
  const request = new Request("https://crm.test/login", {
    headers: { "x-forwarded-for": "203.0.113.8, 10.0.0.1" },
  });
  assert.equal(requestClientAddress(request), "203.0.113.8");
});
