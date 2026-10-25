import { Prisma } from "@prisma/client";
import { getBlobToken, uploadPrivateBlob } from "@/lib/blob/storage";
import { storedLeadPhotos } from "@/lib/leads/photos";
import { ensureWebsiteFormsSystemUser } from "@/lib/leads/website-forms-user";
import { prisma } from "@/lib/prisma";

type IncomingPhoto = {
  name?: string;
  dataUrl?: string;
};

function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) return null;
  try {
    return {
      contentType: match[1] || "image/jpeg",
      buffer: Buffer.from(match[2], "base64"),
    };
  } catch {
    return null;
  }
}

/**
 * Persist lead photo data URLs to Vercel Blob and rewrite metadata to URLs.
 * No-ops when blob storage is not configured.
 */
export async function persistLeadPhotosFromMetadata(
  companyId: string,
  leadId: string,
  metadata: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!getBlobToken()) {
    const photos = Array.isArray(metadata.photos) ? metadata.photos : [];
    if (photos.length) {
      return {
        ...metadata,
        photos: [],
        photoCount:
          typeof metadata.photoCount === "number" ? metadata.photoCount : photos.length,
        photosPendingCsr: true,
        photoNote: "Photos pending CSR request (blob storage not configured)",
      };
    }
    return metadata;
  }

  const incoming = Array.isArray(metadata.photos)
    ? (metadata.photos as IncomingPhoto[])
    : [];
  if (!incoming.length) return metadata;

  const uploaded: { name: string; url: string; pathname: string; mimeType: string }[] = [];

  for (let i = 0; i < incoming.length; i++) {
    const photo = incoming[i];
    if (!photo?.dataUrl) continue;
    const parsed = parseDataUrl(photo.dataUrl);
    if (!parsed) continue;
    const safeName = (photo.name || `photo-${i + 1}.jpg`).replace(/[^\w.\-]+/g, "_");
    const pathname = `leads/${companyId}/${leadId}/${Date.now()}-${i}-${safeName}`;
    try {
      const blob = await uploadPrivateBlob(pathname, parsed.buffer, {
        contentType: parsed.contentType,
        addRandomSuffix: false,
      });
      uploaded.push({
        name: safeName,
        url: blob.url,
        pathname: blob.pathname,
        mimeType: parsed.contentType,
      });
    } catch (err) {
      console.error("Failed to upload lead photo", err);
    }
  }

  return {
    ...metadata,
    photos: uploaded.map((p) => ({
      name: p.name,
      url: p.url,
      pathname: p.pathname,
      mimeType: p.mimeType,
    })),
    photoUrls: uploaded.map((p) => p.url),
    photoCount: uploaded.length || metadata.photoCount,
    photosPendingCsr: uploaded.length === 0 && incoming.length > 0,
  };
}

/**
 * Reference persisted lead photos from the customer's Attachments tab. The
 * blob itself remains single-copy; CustomerAttachment provides the durable
 * customer-profile association.
 */
export async function attachLeadPhotosToCustomer(params: {
  companyId: string;
  leadId: string;
  customerId: string;
  metadata: Record<string, unknown>;
}) {
  const photos = storedLeadPhotos(params.metadata, {
    companyId: params.companyId,
    leadId: params.leadId,
  });
  if (!photos.length) return 0;

  const existing = await prisma.customerAttachment.findMany({
    where: {
      customerId: params.customerId,
      blobUrl: { in: photos.map((photo) => photo.url) },
    },
    select: { blobUrl: true },
  });
  const existingUrls = new Set(existing.map((attachment) => attachment.blobUrl));
  const missing = photos.filter((photo) => !existingUrls.has(photo.url));
  if (!missing.length) return 0;

  const uploadedById = await ensureWebsiteFormsSystemUser(params.companyId);
  const created = await prisma.customerAttachment.createMany({
    data: missing.map((photo) => ({
      customerId: params.customerId,
      uploadedById,
      blobUrl: photo.url,
      fileName: photo.name,
      mimeType: photo.mimeType,
    })),
  });
  return created.count;
}

export async function updateLeadMetadataPhotos(
  leadId: string,
  metadata: Record<string, unknown>
) {
  return prisma.lead.update({
    where: { id: leadId },
    data: { metadata: metadata as Prisma.InputJsonValue },
  });
}
