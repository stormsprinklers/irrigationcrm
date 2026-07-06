import { fetchBlobBytes } from "@/lib/blob/download";
import { uploadGbpPhotoBytes } from "@/lib/google-business/v4-api";
import { prisma } from "@/lib/prisma";

type UploadParams = {
  companyId: string;
  accountId: string;
  locationId: string;
  attachmentId: string;
  category?: "ADDITIONAL" | "AT_WORK" | "EXTERIOR" | "INTERIOR" | "PRODUCT" | "TEAMS";
};

export async function uploadGbpPhotoFromAttachment(params: UploadParams) {
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
