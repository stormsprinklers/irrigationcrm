import { createPublicKey, verify } from "node:crypto";

/** Verify Twilio Email's signed event webhook against its raw request bytes. */
export function validateEmailWebhook(payload: Buffer, signature: string, timestamp: string): boolean {
  const encodedKey = process.env.TWILIO_EMAIL_WEBHOOK_PUBLIC_KEY?.trim();
  if (!encodedKey || !signature || !/^\d+$/.test(timestamp)) return false;
  try {
    const key = createPublicKey({ key: Buffer.from(encodedKey, "base64"), format: "der", type: "spki" });
    return verify(
      "sha256",
      Buffer.concat([Buffer.from(timestamp, "utf8"), payload]),
      key,
      Buffer.from(signature, "base64")
    );
  } catch {
    return false;
  }
}
