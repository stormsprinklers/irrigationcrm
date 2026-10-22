import { createHash } from "node:crypto";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizePipelineEmail(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized && normalized.includes("@") ? normalized : null;
}

export function normalizePipelineUsPhone(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

function clean(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

export function buildPipelineIdentitySnapshot(input: {
  email?: string | null;
  phone?: string | null;
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  userAgent?: string | null;
}) {
  const email = normalizePipelineEmail(input.email);
  const phone = normalizePipelineUsPhone(input.phone);
  return {
    emailSha256: email ? sha256(email) : null,
    phoneSha256: phone ? sha256(phone) : null,
    gclid: clean(input.gclid),
    gbraid: clean(input.gbraid),
    wbraid: clean(input.wbraid),
    fbc: clean(input.fbc),
    fbp: clean(input.fbp),
    userAgent: clean(input.userAgent),
  };
}

export function hashPipelineExternalId(value: string) {
  return sha256(value.trim());
}
