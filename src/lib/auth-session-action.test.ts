import test from "node:test";
import assert from "node:assert/strict";
import { parseAuthSessionAction } from "./auth-session-action";

test("accepts only supported server-validated session actions", () => {
  assert.deepEqual(parseAuthSessionAction({ type: "switch-account", targetUserId: " user-2 " }), {
    type: "switch-account",
    targetUserId: "user-2",
  });
  assert.deepEqual(parseAuthSessionAction({ type: "role-preview", role: "TECH" }), {
    type: "role-preview",
    role: "TECH",
  });
  assert.deepEqual(parseAuthSessionAction({ type: "role-preview", role: null }), {
    type: "role-preview",
    role: null,
  });
});

test("rejects arbitrary identity and role mutations", () => {
  assert.equal(parseAuthSessionAction({ user: { id: "victim", role: "ADMIN" } }), null);
  assert.equal(parseAuthSessionAction({ type: "role-preview", role: "SOCIAL_MEDIA_MANAGER" }), null);
  assert.equal(parseAuthSessionAction({ type: "switch-account", targetUserId: "" }), null);
});
