import { absolutePublicBlobUrl } from "@/lib/blob/urls";
import { uploadPublicBlob } from "@/lib/blob/storage";
import { prisma } from "@/lib/prisma";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function isAllowedMediaMime(mime: string) {
  return ALLOWED_MIME.has(mime.toLowerCase());
}

export function serializeMediaAsset(asset: {
  id: string;
  blobUrl: string;
  pathname: string;
  fileName: string;
  mimeType: string;
  alt: string | null;
  byteSize: number | null;
  createdAt: Date;
}) {
  return {
    id: asset.id,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    alt: asset.alt,
    byteSize: asset.byteSize,
    createdAt: asset.createdAt.toISOString(),
    blobUrl: asset.blobUrl,
    pathname: asset.pathname,
    previewUrl: absolutePublicBlobUrl(asset.blobUrl) ?? asset.blobUrl,
    publicUrl: absolutePublicBlobUrl(asset.blobUrl) ?? asset.blobUrl,
  };
}

export async function listCompanyMediaAssets(companyId: string, limit = 60) {
  const rows = await prisma.companyMediaAsset.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 200),
  });
  return rows.map(serializeMediaAsset);
}

export async function uploadCompanyMediaAsset(params: {
  companyId: string;
  userId: string;
  file: File;
  alt?: string | null;
}) {
  const mime = params.file.type || "application/octet-stream";
  if (!isAllowedMediaMime(mime)) {
    throw new Error("Only JPEG, PNG, WebP, and GIF images are allowed");
  }
  if (params.file.size > 12 * 1024 * 1024) {
    throw new Error("Image must be 12MB or smaller");
  }

  const safeName = params.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const pathname = `media/${params.companyId}/${Date.now()}-${safeName}`;
  const blob = await uploadPublicBlob(pathname, params.file, {
    contentType: mime,
    addRandomSuffix: true,
  });

  const asset = await prisma.companyMediaAsset.create({
    data: {
      companyId: params.companyId,
      createdById: params.userId,
      blobUrl: blob.url,
      pathname: blob.pathname || pathname,
      fileName: params.file.name,
      mimeType: mime,
      alt: params.alt?.trim() || null,
      byteSize: params.file.size,
    },
  });

  return serializeMediaAsset(asset);
}
