import { createPrivateKey } from "node:crypto";

/** Accept normal PEM, quoted env text, escaped newlines, or base64-encoded PEM/DER. */
export function normalizeApnsSigningKey(input: string): string {
  let value = input.trim().replace(/^\uFEFF/, "").replace(/^APNS_PRIVATE_KEY\s*=\s*/, "").trim();
  if (value.startsWith('"')) {
    try { const decoded: unknown = JSON.parse(value); if (typeof decoded === "string") value = decoded; } catch { /* paired quotes below */ }
  }
  value = value.replace(/^["'“”]|["'“”]$/g, "").replace(/\\r\\n|\\n|\\r/g, "\n").trim();
  if (!value.includes("-----BEGIN")) {
    const decoded = Buffer.from(value.replace(/\s/g, ""), "base64");
    value = decoded.toString("utf8").includes("-----BEGIN") ? decoded.toString("utf8") : value;
  }
  let key;
  if (value.includes("-----BEGIN")) {
    const match = value.match(/-----BEGIN (?:EC )?PRIVATE KEY-----([\s\S]*?)-----END (?:EC )?PRIVATE KEY-----/);
    if (!match) throw new Error("Invalid APNs key format");
    const label = value.includes("BEGIN EC PRIVATE KEY") ? "EC PRIVATE KEY" : "PRIVATE KEY";
    const body = match[1]!.replace(/\s/g, "");
    key = createPrivateKey(`-----BEGIN ${label}-----\n${body.match(/.{1,64}/g)?.join("\n")}\n-----END ${label}-----`);
  } else {
    key = createPrivateKey({ key: Buffer.from(value.replace(/\s/g, ""), "base64"), format: "der", type: "pkcs8" });
  }
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") throw new Error("APNs requires a P-256 signing key");
  return key.export({ format: "pem", type: "pkcs8" }).toString();
}
