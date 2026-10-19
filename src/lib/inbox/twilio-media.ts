import heicConvert from "heic-convert";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import { safeFileName } from "@/lib/inbox/attachments";
import {
  readResponseBufferLimited,
  safeOutboundFetch,
  validateOutboundUrlSyntax,
} from "@/lib/security/outbound-fetch";

/**
 * Twilio does not impose an inbound-MMS size limit. Keep a defensive application
 * limit high enough for full-resolution phone photos while bounding function memory.
 */
export const INBOUND_SMS_MEDIA_MAX_BYTES = 25 * 1024 * 1024;

/**
 * The Media resource starts on api.twilio.com. With protected media enabled,
 * Twilio redirects the authenticated request to a short-lived twiliocdn URL;
 * older unprotected media can redirect to Twilio's legacy S3 host.
 */
export const TWILIO_MEDIA_DOWNLOAD_HOSTS = [
  "api.twilio.com",
  "mms.twiliocdn.com",
  "s3-external-1.amazonaws.com",
] as const;

type MediaAuthCredentials = { username: string; password: string; source: string };

export function twilioMediaAuthCandidates(
  env: Record<string, string | undefined> = process.env
): MediaAuthCredentials[] {
  const candidates: MediaAuthCredentials[] = [];
  const add = (username: string | undefined, password: string | undefined, source: string) => {
    const user = username?.trim();
    const secret = password?.trim();
    if (user && secret && !candidates.some((item) => item.username === user)) {
      candidates.push({ username: user, password: secret, source });
    }
  };

  // Twilio recommends API-key authentication for protected media downloads.
  add(env.TWILIO_MEDIA_API_KEY, env.TWILIO_MEDIA_API_SECRET, "media-api-key");
  add(env.TWILIO_API_KEY, env.TWILIO_API_SECRET, "api-key");
  // Account SID + Auth Token remains a supported fallback and also preserves
  // compatibility with existing deployments that have not added an API key.
  add(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, "account-token");

  return candidates;
}

function normalizedMimeType(mimeType: string) {
  return mimeType.toLowerCase().split(";", 1)[0].trim() || "application/octet-stream";
}

function extensionForMimeType(mimeType: string) {
  const normalized = normalizedMimeType(mimeType);
  const known: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/tiff": "tiff",
    "image/bmp": "bmp",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/3gpp": "3gp",
    "video/mpeg": "mpeg",
  };
  return known[normalized] ?? (normalized.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "bin");
}

type HeicConverter = (options: {
  buffer: Uint8Array;
  format: "JPEG" | "PNG";
  quality?: number;
}) => Promise<Uint8Array>;

export async function normalizeInboundTwilioMedia(
  buffer: Buffer,
  mimeType: string,
  convertHeic: HeicConverter = heicConvert
) {
  const normalized = normalizedMimeType(mimeType);
  try {
    if (normalized === "image/heic" || normalized === "image/heif") {
      const converted = await convertHeic({ buffer, format: "JPEG", quality: 0.9 });
      return { buffer: Buffer.from(converted), mimeType: "image/jpeg", converted: true };
    }
  } catch (error) {
    // Retain the original as a downloadable attachment instead of losing it.
    console.error("Inbound MMS image conversion failed; storing original", {
      mimeType: normalized,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return { buffer, mimeType: normalized, converted: false };
}

async function fetchTwilioMedia(mediaUrl: string) {
  const candidates = twilioMediaAuthCandidates();
  if (!candidates.length) throw new Error("Twilio media credentials not configured");

  // Never send Twilio credentials to a host supplied by the webhook. Redirects
  // are separately restricted to Twilio's documented media delivery hosts.
  validateOutboundUrlSyntax(mediaUrl, { allowedHosts: ["api.twilio.com"] });

  let lastStatus: number | null = null;
  for (const credentials of candidates) {
    const auth = Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64");
    const response = await safeOutboundFetch(
      mediaUrl,
      { headers: { Authorization: `Basic ${auth}` } },
      { allowedHosts: TWILIO_MEDIA_DOWNLOAD_HOSTS }
    );
    if (response.ok) return response;
    lastStatus = response.status;
    if (response.status !== 401 && response.status !== 403) break;
  }

  throw new Error(`Failed to download Twilio media (${lastStatus ?? "unknown status"})`);
}

export async function downloadTwilioMedia(params: {
  mediaUrl: string;
  companyId: string;
  messageId: string;
  mimeType: string;
  index: number;
}) {
  const res = await fetchTwilioMedia(params.mediaUrl);
  const original = await readResponseBufferLimited(res, INBOUND_SMS_MEDIA_MAX_BYTES);
  const normalized = await normalizeInboundTwilioMedia(original, params.mimeType);
  const ext = extensionForMimeType(normalized.mimeType);
  const fileName = `media-${params.index}.${ext}`;

  const blob = await uploadPrivateBlob(
    `inbox/${params.companyId}/sms/${params.messageId}/${Date.now()}-${safeFileName(fileName)}`,
    normalized.buffer,
    { contentType: normalized.mimeType }
  );

  return {
    blobUrl: blob.url,
    fileName,
    mimeType: normalized.mimeType,
    sizeBytes: normalized.buffer.length,
  };
}

export function parseTwilioMediaParams(params: Record<string, string>) {
  const count = Number(params.NumMedia ?? "0");
  if (!count || count <= 0) return [];

  const items: { url: string; contentType: string; index: number }[] = [];
  for (let i = 0; i < count; i++) {
    const url = params[`MediaUrl${i}`];
    const contentType = params[`MediaContentType${i}`] ?? "application/octet-stream";
    if (url) items.push({ url, contentType, index: i });
  }
  return items;
}

function mediaIndexFromFileName(fileName: string | null | undefined) {
  const match = fileName?.match(/^media-(\d+)\./i);
  return match ? Number(match[1]) : null;
}

/** Select only attachments that have not already been persisted for a retried webhook. */
export function missingTwilioMediaItems<T extends { index: number }>(
  items: T[],
  existingFileNames: Array<string | null | undefined>
) {
  const existingIndexes = new Set(
    existingFileNames
      .map(mediaIndexFromFileName)
      .filter((index): index is number => index !== null)
  );
  return items.filter((item) => !existingIndexes.has(item.index));
}
