import assert from "node:assert/strict";
import test from "node:test";
import {
  isPrivateNetworkAddress,
  OutboundFetchError,
  readResponseBufferLimited,
  validateOutboundUrlSyntax,
} from "./outbound-fetch";

test("outbound URL policy rejects local, private, credentialed, and non-HTTPS targets", () => {
  for (const value of [
    "http://example.com/file",
    "https://localhost/file",
    "https://127.0.0.1/file",
    "https://169.254.169.254/latest/meta-data",
    "https://user:pass@example.com/file",
  ]) {
    assert.throws(() => validateOutboundUrlSyntax(value), OutboundFetchError);
  }
});

test("outbound URL allowlist uses exact host matching", () => {
  assert.equal(
    validateOutboundUrlSyntax("https://api.twilio.com/file", { allowedHosts: ["api.twilio.com"] }).hostname,
    "api.twilio.com"
  );
  assert.throws(
    () => validateOutboundUrlSyntax("https://api.twilio.com.evil.test/file", { allowedHosts: ["api.twilio.com"] }),
    OutboundFetchError
  );
});

test("private network detector covers IPv4 and IPv6 ranges", () => {
  for (const address of ["10.0.0.1", "172.16.1.1", "192.168.1.1", "::1", "fd00::1", "fe80::1"]) {
    assert.equal(isPrivateNetworkAddress(address), true, address);
  }
  assert.equal(isPrivateNetworkAddress("203.0.113.10"), false);
  assert.equal(isPrivateNetworkAddress("2001:db8::1"), false);
});

test("bounded response reader rejects oversized bodies without trusting content length", async () => {
  await assert.rejects(
    () => readResponseBufferLimited(new Response("123456"), 5),
    OutboundFetchError
  );
});
