import test from "node:test";
import assert from "node:assert/strict";
import {
  enforceBrowserMutationOrigin,
  requiresBrowserMutationProtection,
} from "./csrf";

test("blocks cross-site cookie-authenticated mutations", () => {
  const request = new Request("https://crm.example/api/customers", {
    method: "POST",
    headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
  });
  assert.equal(enforceBrowserMutationOrigin(request)?.status, 403);
});

test("allows same-origin mutations", () => {
  const request = new Request("https://crm.example/api/customers", {
    method: "POST",
    headers: { origin: "https://crm.example", "sec-fetch-site": "same-origin" },
  });
  assert.equal(enforceBrowserMutationOrigin(request), null);
});

test("does not intercept provider or bearer endpoints", () => {
  const webhook = new Request("https://crm.example/api/stripe/webhook", {
    method: "POST",
    headers: { origin: "https://stripe.example", "sec-fetch-site": "cross-site" },
  });
  const bearer = new Request("https://crm.example/api/customers", {
    method: "POST",
    headers: { authorization: "Bearer test", origin: "https://native.example" },
  });
  assert.equal(requiresBrowserMutationProtection(webhook), false);
  assert.equal(requiresBrowserMutationProtection(bearer), false);
});
