import {
  getGeneralGoogleOAuthConfig,
  isGeneralGoogleOAuthConfigured,
} from "@/lib/google-oauth/config";
import {
  createOAuthState,
  exchangeGoogleOAuthCode,
  verifyOAuthState,
} from "@/lib/google-oauth/oauth";
import type { GbpJobPhotoDto } from "@/lib/google-business/engagement-types";
import { DRIVE_FILE_SCOPE, type GoogleDriveConnectionStatus, type GoogleDriveFileDto } from "@/lib/google-drive/types";
import { prisma } from "@/lib/prisma";

const DRIVE_API = "https://www.googleapis.com/drive/v3";

export class GoogleDriveApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export function isGoogleDriveConfigured() {
  return isGeneralGoogleOAuthConfigured();
}

export function getGooglePickerApiKey() {
  return (
    process.env.GOOGLE_PICKER_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    ""
  );
}

export function isGooglePickerConfigured() {
  return Boolean(getGooglePickerApiKey());
}

export function buildGoogleDriveAuthUrl(companyId: string, redirectUri: string) {
  const { clientId } = getGeneralGoogleOAuthConfig();
  if (!clientId) throw new GoogleDriveApiError("Google OAuth is not configured", 503);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: DRIVE_FILE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: createOAuthState(companyId),
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export { verifyOAuthState };

export async function exchangeOAuthCode(code: string, redirectUri: string) {
  return exchangeGoogleOAuthCode(
    code,
    redirectUri,
    getGeneralGoogleOAuthConfig(),
    GoogleDriveApiError
  );
}

export async function getGoogleDriveAccessToken(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { googleDriveRefreshToken: true },
  });

  if (!company?.googleDriveRefreshToken) {
    throw new GoogleDriveApiError("Google Drive is not connected", 400);
  }

  const { clientId, clientSecret } = getGeneralGoogleOAuthConfig();
  if (!clientId || !clientSecret) {
    throw new GoogleDriveApiError("Google OAuth is not configured", 503);
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: company.googleDriveRefreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw new GoogleDriveApiError(
      data.error ?? "Failed to refresh Google Drive access token",
      res.status
    );
  }

  return data.access_token;
}

export async function getGoogleDriveConnectionStatus(
  companyId: string
): Promise<GoogleDriveConnectionStatus> {
  const { clientId, clientSecret } = getGeneralGoogleOAuthConfig();
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      googleDriveRefreshToken: true,
      googleDriveConnectedAt: true,
    },
  });

  return {
    configured: isGoogleDriveConfigured(),
    connected: Boolean(company?.googleDriveRefreshToken),
    connectedAt: company?.googleDriveConnectedAt?.toISOString() ?? null,
    pickerConfigured: isGooglePickerConfigured(),
    oauthEnv: {
      hasClientId: Boolean(clientId),
      hasClientSecret: Boolean(clientSecret),
      hasPickerApiKey: isGooglePickerConfigured(),
    },
  };
}

async function driveGet<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new GoogleDriveApiError(
      body.error?.message ?? `Google Drive API error (${res.status})`,
      res.status
    );
  }

  return res.json() as Promise<T>;
}

export async function listAccessibleDriveImages(
  companyId: string,
  limit = 80
): Promise<GoogleDriveFileDto[]> {
  const accessToken = await getGoogleDriveAccessToken(companyId);
  const params = new URLSearchParams({
    q: "mimeType contains 'image/' and trashed = false",
    spaces: "drive",
    pageSize: String(Math.min(100, Math.max(1, limit))),
    fields: "files(id,name,mimeType,createdTime,webViewLink)",
    orderBy: "modifiedTime desc",
  });

  const data = await driveGet<{ files?: GoogleDriveFileDto[] }>(
    accessToken,
    `/files?${params.toString()}`
  );

  return data.files ?? [];
}

export async function getDriveFileMetadata(companyId: string, fileId: string) {
  const accessToken = await getGoogleDriveAccessToken(companyId);
  return driveGet<GoogleDriveFileDto>(
    accessToken,
    `/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,createdTime,webViewLink`
  );
}

export async function fetchDriveFileBytes(companyId: string, fileId: string) {
  const accessToken = await getGoogleDriveAccessToken(companyId);
  const meta = await getDriveFileMetadata(companyId, fileId);

  if (!meta.mimeType?.startsWith("image/")) {
    throw new GoogleDriveApiError("Selected Drive file is not an image", 400);
  }

  const res = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`,
    {
      cache: "no-store",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    throw new GoogleDriveApiError(`Failed to download Drive file (${res.status})`, res.status);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const mimeType =
    res.headers.get("content-type")?.split(";")[0].trim() || meta.mimeType || "image/jpeg";

  return { buffer, mimeType, fileName: meta.name };
}

export function driveFileToJobPhoto(
  file: GoogleDriveFileDto,
  previewUrl: string
): GbpJobPhotoDto {
  return {
    id: `drive:${file.id}`,
    source: "drive",
    fileName: file.name,
    mimeType: file.mimeType,
    previewUrl,
    visitId: null,
    visitTitle: file.name,
    visitStartAt: null,
    createdAt: file.createdTime ?? new Date().toISOString(),
    permalink: file.webViewLink,
  };
}

export async function listDriveJobPhotos(
  companyId: string,
  previewUrlFor: (fileId: string) => string
): Promise<GbpJobPhotoDto[]> {
  try {
    const files = await listAccessibleDriveImages(companyId);
    return files.map((file) => driveFileToJobPhoto(file, previewUrlFor(file.id)));
  } catch {
    return [];
  }
}
