import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { blobProxyUrl } from "@/lib/blob/urls";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import { canManageCustomers } from "@/lib/customers/permissions";
import { canSubmitSocialPosts } from "@/lib/marketing/social-permissions";
import {
  driveFileToJobPhoto,
  fetchDriveFileBytes,
  getDriveFileMetadata,
  GoogleDriveApiError,
} from "@/lib/google-drive/client";

/**
 * After Google Picker selects files (drive.file), register them for the gallery
 * and optionally copy into marketing blob storage for social posts.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const canUse =
      canManageCustomers(user.role) || canSubmitSocialPosts(user.role);
    if (!canUse) return forbiddenResponse();

    const body = (await request.json()) as {
      fileIds?: string[];
      copyToBlob?: boolean;
    };

    const fileIds = Array.isArray(body.fileIds)
      ? body.fileIds.map((id) => String(id).trim()).filter(Boolean)
      : [];

    if (fileIds.length === 0) {
      return badRequestResponse("fileIds is required");
    }
    if (fileIds.length > 20) {
      return badRequestResponse("Select up to 20 Drive files at a time");
    }

    const photos = [];
    const media = [];

    for (const fileId of fileIds) {
      const meta = await getDriveFileMetadata(user.companyId, fileId);
      const previewUrl = `/api/marketing/google-drive/files/${fileId}/content`;
      photos.push(driveFileToJobPhoto(meta, previewUrl));

      if (body.copyToBlob) {
        const { buffer, mimeType, fileName } = await fetchDriveFileBytes(
          user.companyId,
          fileId
        );
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const pathname = `marketing/${user.companyId}/drive-${Date.now()}-${safeName}`;
        const blob = await uploadPrivateBlob(pathname, buffer, { contentType: mimeType });
        media.push({
          blobUrl: blob.url,
          displayUrl: blobProxyUrl(blob.url),
          fileName,
          mimeType,
          driveFileId: fileId,
        });
      }
    }

    return NextResponse.json({ photos, media });
  } catch (error) {
    if (error instanceof GoogleDriveApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to import Drive files";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
