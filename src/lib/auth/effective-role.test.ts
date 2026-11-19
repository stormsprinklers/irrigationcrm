import assert from "node:assert/strict";
import test from "node:test";
import { effectiveSessionRole, hasValidAdminPreview } from "./effective-role";

test("current database role overrides a stale broader session role", () => {
  assert.equal(
    effectiveSessionRole({ tokenRole: "MANAGER", currentRole: "BULB_PREP" }),
    "BULB_PREP"
  );
  assert.equal(
    effectiveSessionRole({ tokenRole: "ADMIN", currentRole: "TECH" }),
    "TECH"
  );
});

test("an active admin role preview remains effective", () => {
  assert.equal(
    effectiveSessionRole({
      tokenRole: "BULB_PREP",
      tokenTrueRole: "ADMIN",
      currentRole: "ADMIN",
    }),
    "BULB_PREP"
  );
  assert.equal(hasValidAdminPreview({ tokenTrueRole: "ADMIN", currentRole: "ADMIN" }), true);
  assert.equal(hasValidAdminPreview({ tokenTrueRole: "ADMIN", currentRole: "BULB_PREP" }), false);
});
