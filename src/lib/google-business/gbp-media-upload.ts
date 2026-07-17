import { fetchBlobBytes } from "@/lib/blob/download";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import { absolutePublicBlobUrl } from "@/lib/blob/urls";
import { uploadGbpPhotoBytes } from "@/lib/google-business/v4-api";
import { parsePickablePhotoId, fetchSocialPhotoBytes } from "@/lib/meta/social-photos";
import { prisma } from "@/lib/prisma";

type PickablePhotoParams = {
  companyId: string;
  photoId: string;
  previewUrl?: string | null;
};

type UploadParams = PickablePhotoParams & {
  accountId: string;
  locationId: string;
  category?: "ADDITIONAL" | "AT_WORK" | "EXTERIOR" | "INTERIOR" | "PRODUCT" | "TEAMS";
};

function normalizeImageMimeType(mimeType: string) {
  const normalized = mimeType.split(";")[0].trim().toLowerCase();
  if (normalized === "image/jpg") return "image/jpeg";
  return normalized || "image/jpeg";
}

function imageExtensionForMime(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "jpg";
}

async function fetchPickablePhotoBytes(params: PickablePhotoParams) {
  const parsed = parsePickablePhotoId(params.photoId);

  if (parsed.source === "visit") {
    const attachment = await prisma.visitAttachment.findFirst({
      where: {
        id: parsed.externalId,
        visit: { companyId: params.companyId },
        mimeType: { startsWith: "image/" },
      },
      select: { blobUrl: true, mimeType: true },
    });

    if (!attachment) {
      throw new Error("Job photo not found");
    }

    const { buffer, mimeType } = await fetchBlobBytes(attachment.blobUrl);
    return {
      buffer,
      mimeType: normalizeImageMimeType(mimeType || attachment.mimeType),
    };
  }

  const { buffer, mimeType } = await fetchSocialPhotoBytes(params.companyId, params.photoId, {
    previewUrl: params.previewUrl,
  });

  return {
    buffer,
    mimeType: normalizeImageMimeType(mimeType),
  };
}

/** Local posts only accept publicly fetchable sourceUrl values — not GBP media gallery uploads. */
export async function resolveGbpLocalPostPhotoSourceUrl(
  params: PickablePhotoParams
): Promise<string> {
  const { buffer, mimeType } = await fetchPickablePhotoBytes(params);

  if (!mimeType.startsWith("image/")) {
    throw new Error("Google post photos must be an image file");
  }
  if (buffer.length === 0) {
    throw new Error("Photo file was empty");
  }
  if (buffer.length > 10 * 1024 * 1024) {
    throw new Error("Google post photos must be 10 MB or smaller");
  }

  const ext = imageExtensionForMime(mimeType);
  const blob = await uploadPrivateBlob(
    `gbp/local-posts/${params.companyId}/${Date.now()}.${ext}`,
    buffer,
    { contentType: mimeType }
  );

  const publicUrl = absolutePublicBlobUrl(blob.url);
  if (!publicUrl) {
    throw new Error("Failed to build a public URL for the Google post photo");
  }
  return publicUrl;
}

export async function uploadGbpPhotoFromPickableId(params: UploadParams) {
  const { buffer, mimeType } = await fetchPickablePhotoBytes(params);

  return uploadGbpPhotoBytes(
    params.companyId,
    params.accountId,
    params.locationId,
    buffer,
    mimeType,
    params.category ?? "ADDITIONAL"
  );
}

type AttachmentUploadParams = {
  companyId: string;
  accountId: string;
  locationId: string;
  attachmentId: string;
  category?: "ADDITIONAL" | "AT_WORK" | "EXTERIOR" | "INTERIOR" | "PRODUCT" | "TEAMS";
};

export async function uploadGbpPhotoFromAttachment(params: AttachmentUploadParams) {
  const attachment = await prisma.visitAttachment.findFirst({
    where: {
      id: params.attachmentId,
      visit: { companyId: params.companyId },
      mimeType: { startsWith: "image/" },
    },
    select: { blobUrl: true, mimeType: true },
  });

  if (!attachment) {
    throw new Error("Job photo not found");
  }

  const { buffer, mimeType } = await fetchBlobBytes(attachment.blobUrl);

  return uploadGbpPhotoBytes(
    params.companyId,
    params.accountId,
    params.locationId,
    buffer,
    mimeType || attachment.mimeType,
    params.category ?? "ADDITIONAL"
  );
}
