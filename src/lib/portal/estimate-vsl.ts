import { createHmac, timingSafeEqual } from "crypto";
import { getAuthSecret } from "@/lib/auth-secret";
import { absolutePublicBlobUrl } from "@/lib/blob/urls";

const GATE_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_WAIT_SECONDS = 60 * 60;

type EstimateVslCompany = {
  id: string;
  estimateVslEnabled: boolean;
  estimateVslVideoUrl: string | null;
  estimateVslWaitSeconds: number;
};

type GateTokenPayload = {
  companyId: string;
  customerId: string;
  estimateId: string;
  startedAt: number;
  waitSeconds: number;
  expiresAt: number;
};

export type EstimateVslGate = {
  videoUrl: string;
  waitSeconds: number;
  gateToken: string;
  canSkipImmediately: boolean;
};

export function normalizeEstimateVslWaitSeconds(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(MAX_WAIT_SECONDS, Math.max(0, Math.round(parsed)));
}

function secret() {
  const value = getAuthSecret();
  if (!value) throw new Error("AUTH_SECRET is not configured");
  return value;
}

function sign(data: string) {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

function encodeGateToken(payload: GateTokenPayload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function decodeEstimateVslGateToken(token: string): GateTokenPayload | null {
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;
  const expected = sign(data);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(data, "base64url").toString("utf8")
    ) as GateTokenPayload;
    if (
      !payload.companyId ||
      !payload.customerId ||
      !payload.estimateId ||
      !Number.isFinite(payload.startedAt) ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt < Date.now()
    ) {
      return null;
    }
    return {
      ...payload,
      waitSeconds: normalizeEstimateVslWaitSeconds(payload.waitSeconds),
    };
  } catch {
    return null;
  }
}

export function createEstimateVslGate(params: {
  company: EstimateVslCompany;
  customerId: string;
  estimateId: string;
  viewedAt: Date | null;
}): EstimateVslGate | null {
  const { company } = params;
  const storedVideoUrl = company.estimateVslVideoUrl?.trim();
  if (!company.estimateVslEnabled || !storedVideoUrl) return null;

  const videoUrl = absolutePublicBlobUrl(storedVideoUrl);
  if (!videoUrl) return null;
  const waitSeconds = normalizeEstimateVslWaitSeconds(company.estimateVslWaitSeconds);
  const startedAt = Date.now();

  return {
    videoUrl,
    waitSeconds,
    canSkipImmediately: Boolean(params.viewedAt),
    gateToken: encodeGateToken({
      companyId: company.id,
      customerId: params.customerId,
      estimateId: params.estimateId,
      startedAt,
      waitSeconds,
      expiresAt: startedAt + GATE_TOKEN_TTL_MS,
    }),
  };
}

export function canCompleteEstimateVslGate(params: {
  payload: GateTokenPayload;
  completedVideo: boolean;
  now?: number;
}) {
  if (params.completedVideo) return true;
  const now = params.now ?? Date.now();
  return now - params.payload.startedAt >= params.payload.waitSeconds * 1000;
}
