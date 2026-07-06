import { fetchBlobBytes } from "@/lib/blob/download";
import { uploadGbpPhotoBytes } from "@/lib/google-business/v4-api";
import { parsePickablePhotoId, fetchSocialPhotoBytes } from "@/lib/meta/social-photos";
import { prisma } from "@/lib/prisma";

type UploadParams = {
  companyId: string;
  accountId: string;
  locationId: string;
  photoId: string;
  category?: "ADDITIONAL" | "AT_WORK" | "EXTERIOR" | "INTERIOR" | "PRODUCT" | "TEAMS";
};

export async function uploadGbpPhotoFromPickableId(params: UploadParams) {
  const parsed = parsePickablePhotoId(params.photoId);

  if (parsed.source === "visit") {
    return uploadGbpPhotoFromAttachment({
      companyId: params.companyId,
      accountId: params.accountId,
      locationId: params.locationId,
      attachmentId: parsed.externalId,
      category: params.category,
    });
  }

  const { buffer, mimeType } = await fetchSocialPhotoBytes(params.companyId, params.photoId);

  return uploadGbpPhotoBytes(
    params.companyId,
    params.accountId,
    params.locationId,
    buffer,
    mimeType,
    params.category ?? "AT_WORK"
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
    params.category ?? "AT_WORK"
  );
}
