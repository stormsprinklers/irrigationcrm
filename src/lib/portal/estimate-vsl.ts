import { createHmac, timingSafeEqual } from "crypto";
import { issueSignedToken, presignUrl } from "@vercel/blob";
import { getAuthSecret } from "@/lib/auth-secret";
import { getBlobToken } from "@/lib/blob/storage";
import {
  absolutePublicBlobUrl,
  blobPathnameFromUrl,
  isBlobStorageUrl,
} from "@/lib/blob/urls";

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

async function estimateVslPlaybackUrl(storedVideoUrl: string) {
  if (!isBlobStorageUrl(storedVideoUrl)) return storedVideoUrl;

  const pathname = blobPathnameFromUrl(storedVideoUrl);
  const token = getBlobToken();
  if (!pathname || !token) return absolutePublicBlobUrl(storedVideoUrl);

  try {
    const validUntil = Date.now() + GATE_TOKEN_TTL_MS;
    const signedToken = await issueSignedToken({
      pathname,
      operations: ["get"],
      validUntil,
      token,
    });
    const { presignedUrl } = await presignUrl(signedToken, {
      access: "private",
      operation: "get",
      pathname,
      validUntil,
    });
    return presignedUrl;
  } catch (error) {
    console.error("Could not create direct estimate VSL playback URL", error);
    return absolutePublicBlobUrl(storedVideoUrl);
  }
}

export async function createEstimateVslGate(params: {
  company: EstimateVslCompany;
  customerId: string;
  estimateId: string;
  viewedAt: Date | null;
}): Promise<EstimateVslGate | null> {
  const { company } = params;
  const storedVideoUrl = company.estimateVslVideoUrl?.trim();
  if (!company.estimateVslEnabled || !storedVideoUrl) return null;

  const videoUrl = await estimateVslPlaybackUrl(storedVideoUrl);
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
