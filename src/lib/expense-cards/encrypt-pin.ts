import { CompactEncrypt, importJWK } from "jose";

type IssuingPinKeyResponse = {
  key_id: string;
  jwk: Record<string, unknown>;
};

/**
 * Encrypt a 4-digit PIN with Stripe's Issuing RSA public key (JWE).
 * Must run client-side — never send plaintext PIN to our servers.
 */
export async function encryptIssuingPin(pin: string): Promise<string> {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error("PIN must be exactly 4 digits");
  }

  const keyData = (await fetch("https://issuing-key.stripe.com/v1/keys").then((r) => {
    if (!r.ok) throw new Error("Failed to fetch Stripe Issuing PIN key");
    return r.json();
  })) as IssuingPinKeyResponse;

  const publicKey = await importJWK(keyData.jwk, "RSA-OAEP");
  return new CompactEncrypt(new TextEncoder().encode(pin))
    .setProtectedHeader({
      alg: "RSA-OAEP",
      enc: "A128CBC-HS256",
      kid: keyData.key_id,
    })
    .encrypt(publicKey);
}
