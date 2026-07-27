import { Prisma } from "@prisma/client";
import { getBlobToken, uploadPrivateBlob } from "@/lib/blob/storage";
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

  const uploaded: { name: string; url: string; pathname: string }[] = [];

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
      uploaded.push({ name: safeName, url: blob.url, pathname: blob.pathname });
    } catch (err) {
      console.error("Failed to upload lead photo", err);
    }
  }

  return {
    ...metadata,
    photos: uploaded.map((p) => ({ name: p.name, url: p.url, pathname: p.pathname })),
    photoUrls: uploaded.map((p) => p.url),
    photoCount: uploaded.length || metadata.photoCount,
    photosPendingCsr: uploaded.length === 0 && incoming.length > 0,
  };
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
