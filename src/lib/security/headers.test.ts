import test from "node:test";
import assert from "node:assert/strict";
import { buildSecurityHeaders } from "./headers";

test("production headers prevent framing and insecure resource upgrades", () => {
  const headers = new Map(buildSecurityHeaders(true).map((item) => [item.key, item.value]));
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.match(headers.get("Content-Security-Policy") ?? "", /frame-ancestors 'none'/);
  assert.match(headers.get("Content-Security-Policy") ?? "", /upgrade-insecure-requests/);
  assert.doesNotMatch(headers.get("Content-Security-Policy") ?? "", /unsafe-eval/);
});

test("development CSP permits Next.js evaluation without weakening production", () => {
  const csp = buildSecurityHeaders(false).find((item) => item.key === "Content-Security-Policy")?.value ?? "";
  assert.match(csp, /unsafe-eval/);
  assert.doesNotMatch(csp, /upgrade-insecure-requests/);
});
