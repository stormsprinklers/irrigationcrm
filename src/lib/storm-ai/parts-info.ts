import { prisma } from "@/lib/prisma";
import { absoluteBlobProxyUrl, blobProxyUrl, isBlobStorageUrl } from "@/lib/blob/urls";

export const PART_MANUAL_LINK_MIME = "text/uri-list";

export function isPartManualLink(mimeType: string | null | undefined, url: string | null | undefined) {
  if (!url) return false;
  if (mimeType === PART_MANUAL_LINK_MIME || mimeType === "link") return true;
  return /^https?:\/\//i.test(url) && !isBlobStorageUrl(url);
}

export function normalizeManualLink(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function resolveStoredBlobUrl(storedUrl: string, absolute: boolean) {
  return (absolute ? absoluteBlobProxyUrl(storedUrl) : blobProxyUrl(storedUrl)) ?? storedUrl;
}

export function resolveManualUrl(
  storedUrl: string | null,
  mimeType: string | null,
  absolute = false
) {
  if (!storedUrl) return null;
  if (isPartManualLink(mimeType, storedUrl)) return storedUrl;
  return resolveStoredBlobUrl(storedUrl, absolute);
}

export function serializePartPhoto(
  photo: {
    id: string;
    blobUrl: string;
    pathname: string;
    fileName: string;
    mimeType: string;
    alt: string | null;
    sortOrder: number;
  },
  absolute = false
) {
  return {
    id: photo.id,
    fileName: photo.fileName,
    mimeType: photo.mimeType,
    alt: photo.alt,
    sortOrder: photo.sortOrder,
    url: resolveStoredBlobUrl(photo.blobUrl, absolute),
  };
}

export function serializePart(
  part: {
    id: string;
    sectionId: string;
    name: string;
    manufacturer: string | null;
    partNumber: string | null;
    visualDescription: string | null;
    technicalDescription: string | null;
    manualUrl: string | null;
    manualFileName: string | null;
    manualMimeType: string | null;
    active: boolean;
    sortOrder: number;
    section?: { id: string; name: string } | null;
    photos?: Array<{
      id: string;
      blobUrl: string;
      pathname: string;
      fileName: string;
      mimeType: string;
      alt: string | null;
      sortOrder: number;
    }>;
  },
  opts?: { absoluteUrls?: boolean }
) {
  const absolute = opts?.absoluteUrls === true;
  const manualIsLink = isPartManualLink(part.manualMimeType, part.manualUrl);
  return {
    id: part.id,
    sectionId: part.sectionId,
    sectionName: part.section?.name ?? null,
    name: part.name,
    manufacturer: part.manufacturer,
    partNumber: part.partNumber,
    visualDescription: part.visualDescription,
    technicalDescription: part.technicalDescription,
    manualUrl: resolveManualUrl(part.manualUrl, part.manualMimeType, absolute),
    manualFileName: part.manualFileName,
    manualMimeType: part.manualMimeType,
    manualKind: part.manualUrl ? (manualIsLink ? ("link" as const) : ("pdf" as const)) : null,
    active: part.active,
    sortOrder: part.sortOrder,
    photos: (part.photos ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => serializePartPhoto(p, absolute)),
  };
}

export async function searchPartsInfo(companyId: string, query: string, take = 12) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const parts = await prisma.techAssistPart.findMany({
    where: { companyId, active: true },
    include: {
      section: { select: { id: true, name: true } },
      photos: { orderBy: { sortOrder: "asc" }, take: 4 },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    take: 120,
  });

  const tokens = q.split(/\s+/).filter((t) => t.length > 1);
  const scored = parts
    .map((part) => {
      const hay = [
        part.name,
        part.manufacturer ?? "",
        part.partNumber ?? "",
        part.visualDescription ?? "",
        part.technicalDescription ?? "",
        part.section.name,
      ]
        .join(" ")
        .toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (part.name.toLowerCase().includes(token)) score += 4;
        else if ((part.partNumber ?? "").toLowerCase().includes(token)) score += 4;
        else if ((part.visualDescription ?? "").toLowerCase().includes(token)) score += 3;
        else if (hay.includes(token)) score += 1;
      }
      if (part.name.toLowerCase().includes(q)) score += 5;
      if (hay.includes(q)) score += 3;
      return { part, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, take);

  return scored.map(({ part }) => ({
    id: part.id,
    name: part.name,
    manufacturer: part.manufacturer,
    partNumber: part.partNumber,
    section: part.section.name,
    visualDescription: part.visualDescription
      ? part.visualDescription.slice(0, 400)
      : null,
    technicalDescription: part.technicalDescription
      ? part.technicalDescription.slice(0, 400)
      : null,
    hasManual: Boolean(part.manualUrl),
    manualUrl: resolveManualUrl(part.manualUrl, part.manualMimeType, true),
    manualKind: part.manualUrl
      ? isPartManualLink(part.manualMimeType, part.manualUrl)
        ? ("link" as const)
        : ("pdf" as const)
      : null,
    photoCount: part.photos.length,
    photos: part.photos.map((p) => ({
      id: p.id,
      url: absoluteBlobProxyUrl(p.blobUrl) ?? p.blobUrl,
      fileName: p.fileName,
    })),
  }));
}

export async function getPartsInfoDetail(companyId: string, partId: string) {
  const part = await prisma.techAssistPart.findFirst({
    where: { id: partId, companyId, active: true },
    include: {
      section: { select: { id: true, name: true } },
      photos: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!part) return null;
  return serializePart(part, { absoluteUrls: true });
}
