import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createPrivateKey } from "node:crypto";
import { importPKCS8, SignJWT, jwtVerify, importSPKI } from "jose";
import { normalizeApnsSigningKey } from "../signing-key";

test("APNs key survives common environment-variable copy formats and signs a verifiable ES256 token", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const cases = [pem, `\n${pem}\n`, pem.replace(/\n/g, "\\n"), JSON.stringify(pem), `'${pem}'`, `APNS_PRIVATE_KEY=${JSON.stringify(pem)}`, pem.replace(/\n/g, ""), Buffer.from(pem).toString("base64"), privateKey.export({ type: "pkcs8", format: "der" }).toString("base64")];
  const verifier = await importSPKI(publicKey.export({ type: "spki", format: "pem" }).toString(), "ES256");
  for (const value of cases) {
    const normalized = normalizeApnsSigningKey(value);
    assert.equal(createPrivateKey(normalized).asymmetricKeyType, "ec");
    const key = await importPKCS8(normalized, "ES256");
    const token = await new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: "TEST" }).setIssuer("TEST_TEAM").setIssuedAt().sign(key);
    assert.equal((await jwtVerify(token, verifier)).payload.iss, "TEST_TEAM");
  }
});

test("truncated or wrong-curve APNs keys are rejected", () => {
  assert.throws(() => normalizeApnsSigningKey("-----BEGIN PRIVATE KEY-----\nbad\n-----END PRIVATE KEY-----"));
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "secp384r1" });
  assert.throws(() => normalizeApnsSigningKey(privateKey.export({ type: "pkcs8", format: "pem" }).toString()), /P-256/);
});
