import test from "node:test";
import assert from "node:assert/strict";
import {
  activePublicCapability,
  createPublicCapability,
  publicCapabilityIsActive,
  rotatePublicCapability,
} from "./public-capability";

test("public capabilities use high-entropy tokens and explicit expiry", () => {
  const capability = createPublicCapability();
  assert.match(capability.publicToken, /^[A-Za-z0-9_-]{40,}$/);
  assert.ok(capability.publicTokenExpiresAt.getTime() > Date.now());
  assert.equal(capability.publicTokenRevokedAt, null);
});

test("rotation changes the token and increments its version", () => {
  const first = createPublicCapability();
  const second = rotatePublicCapability(3);
  assert.notEqual(first.publicToken, second.publicToken);
  assert.equal(second.publicTokenVersion, 4);
});

test("active lookup requires both expiry and non-revocation", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  assert.deepEqual(activePublicCapability("token", now), {
    publicToken: "token",
    publicTokenRevokedAt: null,
    publicTokenExpiresAt: { gt: now },
  });
});

test("active capability check rejects expiry and revocation", () => {
  const future = new Date(Date.now() + 60_000);
  const past = new Date(Date.now() - 60_000);
  assert.equal(
    publicCapabilityIsActive({ publicTokenExpiresAt: future, publicTokenRevokedAt: null }),
    true
  );
  assert.equal(
    publicCapabilityIsActive({ publicTokenExpiresAt: past, publicTokenRevokedAt: null }),
    false
  );
  assert.equal(
    publicCapabilityIsActive({ publicTokenExpiresAt: future, publicTokenRevokedAt: new Date() }),
    false
  );
});
