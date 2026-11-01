import { createHmac, timingSafeEqual } from "node:crypto";
import { getAuthSecret } from "@/lib/auth-secret";

const ESTIMATE_PREVIEW_TTL_MS = 30 * 60 * 1000;

type EstimatePreviewPayload = {
  companyId: string;
  estimateId: string;
  expiresAt: number;
};

function secret() {
  const value = getAuthSecret();
  if (!value) throw new Error("AUTH_SECRET is not configured");
  return value;
}

function sign(data: string) {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export function createEstimatePreviewToken(
  input: { companyId: string; estimateId: string },
  now = Date.now()
) {
  const payload: EstimatePreviewPayload = {
    companyId: input.companyId,
    estimateId: input.estimateId,
    expiresAt: now + ESTIMATE_PREVIEW_TTL_MS,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function verifyEstimatePreviewToken(token: string, now = Date.now()) {
  const [data, signature, extra] = token.split(".");
  if (!data || !signature || extra) return null;

  try {
    const expected = sign(data);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(data, "base64url").toString("utf8")
    ) as EstimatePreviewPayload;
    if (
      !payload.companyId ||
      !payload.estimateId ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt < now
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
