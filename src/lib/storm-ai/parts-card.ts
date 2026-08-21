import { blobProxyUrl } from "@/lib/blob/urls";
import { getPartsInfoDetail } from "@/lib/storm-ai/parts-info";

export type StormAiPartsCard = {
  kind: "parts_card";
  partId: string;
  name: string;
  manufacturer: string | null;
  partNumber: string | null;
  section: string | null;
  /** Short ID blurb for the chat card — never visual or full technical library text. */
  summary: string;
  manualUrl: string | null;
  manualKind: "pdf" | "link" | null;
  photos: Array<{ id?: string; url: string; fileName: string }>;
  confirmedPhotoId?: string | null;
  matchConfidence?: number | null;
  visuallyConfirmed?: boolean;
};

function browserPhotoUrl(url: string) {
  // Prefer same-origin proxy paths so cards work on whatever host the tech is using.
  if (url.startsWith("/api/blob?")) return url;
  try {
    const parsed = new URL(url);
    if (parsed.pathname === "/api/blob" || parsed.pathname.startsWith("/api/blob")) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    /* keep original */
  }
  const proxied = blobProxyUrl(url);
  return proxied ?? url;
}

export function partsCardSummary(part: {
  name: string;
  manufacturer?: string | null;
  partNumber?: string | null;
  section?: string | null;
}) {
  const sentences: string[] = [];
  const manufacturer = part.manufacturer?.trim();
  sentences.push(manufacturer ? `${part.name} by ${manufacturer}.` : `${part.name}.`);
  const partNumber = part.partNumber?.trim();
  if (partNumber) sentences.push(`Part number ${partNumber}.`);
  const section = part.section?.trim();
  if (section) sentences.push(`Listed under ${section}.`);
  return sentences.join(" ");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function toolDataRoot(result: unknown): Record<string, unknown> | null {
  const root = asRecord(result);
  if (!root) return null;
  const data = asRecord(root.data);
  return data ?? root;
}

function photoFromUnknown(row: unknown): { id?: string; url: string; fileName: string } | null {
  const photo = asRecord(row);
  if (!photo || typeof photo.url !== "string" || !photo.url) return null;
  return {
    id: typeof photo.id === "string" ? photo.id : undefined,
    url: photo.url,
    fileName: typeof photo.fileName === "string" ? photo.fileName : "photo.jpg",
  };
}

function orderPhotos(
  photos: Array<{ id?: string; url: string; fileName: string }>,
  confirmedPhotoId?: string | null
) {
  if (!confirmedPhotoId) return photos;
  return [
    ...photos.filter((photo) => photo.id === confirmedPhotoId),
    ...photos.filter((photo) => photo.id !== confirmedPhotoId),
  ];
}

export function partRecordToCard(
  part: Record<string, unknown>,
  opts?: { confirmedPhotoId?: string | null; matchConfidence?: number | null; visuallyConfirmed?: boolean }
): StormAiPartsCard | null {
  const id = typeof part.id === "string" ? part.id : null;
  const name = typeof part.name === "string" ? part.name : null;
  if (!id || !name) return null;

  const section =
    (typeof part.section === "string" ? part.section : null) ??
    (typeof part.sectionName === "string" ? part.sectionName : null);

  const manualKindRaw = part.manualKind;
  const manualKind =
    manualKindRaw === "pdf" || manualKindRaw === "link" ? manualKindRaw : null;

  const photos = Array.isArray(part.photos)
    ? part.photos.map(photoFromUnknown).filter(Boolean)
    : [];
  const confirmedPhotoId =
    opts?.confirmedPhotoId ??
    (typeof part.matchedPhotoId === "string" ? part.matchedPhotoId : null);
  const matchConfidence =
    opts?.matchConfidence ??
    (typeof part.visualConfidence === "number" ? part.visualConfidence : null);

  return {
    kind: "parts_card",
    partId: id,
    name,
    manufacturer: typeof part.manufacturer === "string" ? part.manufacturer : null,
    partNumber: typeof part.partNumber === "string" ? part.partNumber : null,
    section,
    summary: partsCardSummary({
      name,
      manufacturer: typeof part.manufacturer === "string" ? part.manufacturer : null,
      partNumber: typeof part.partNumber === "string" ? part.partNumber : null,
      section,
    }),
    manualUrl: typeof part.manualUrl === "string" ? part.manualUrl : null,
    manualKind,
    photos: orderPhotos(
      (photos as Array<{ id?: string; url: string; fileName: string }>).map((photo) => ({
        ...photo,
        url: browserPhotoUrl(photo.url),
      })),
      confirmedPhotoId
    ),
    confirmedPhotoId,
    matchConfidence,
    visuallyConfirmed: opts?.visuallyConfirmed,
  };
}

/** Build a chat card from a parts tool result (full payload, before slim). */
export async function buildPartsChatCard(
  companyId: string,
  toolName: string,
  result: unknown
): Promise<StormAiPartsCard | null> {
  const root = asRecord(result);
  if (!root || root.ok === false) return null;
  const data = toolDataRoot(result);
  if (!data) return null;

  if (toolName === "get_parts_info") {
    const part = asRecord(data.part);
    return part ? partRecordToCard(part) : null;
  }

  if (toolName === "search_parts_info" && Array.isArray(data.parts) && data.parts.length > 0) {
    const visual = asRecord(data.visualMatch);
    const visionRan = visual?.ran === true;
    const visionError = visual?.error === true;
    const confirmed = visual?.confirmed === true;
    if (visionRan && !confirmed && !visionError) {
      return null;
    }

    const confirmedPhotoId =
      typeof visual?.photoId === "string" ? visual.photoId : null;
    const matchConfidence =
      typeof visual?.confidence === "number" ? visual.confidence : null;
    const top = asRecord(data.parts[0]);
    if (!top) return null;
    const topId =
      (typeof visual?.partId === "string" && visual.partId) ||
      (typeof top.id === "string" ? top.id : null);
    if (topId) {
      const detail = await getPartsInfoDetail(companyId, topId);
      if (detail) {
        const card = partRecordToCard(detail as unknown as Record<string, unknown>, {
          confirmedPhotoId,
          matchConfidence,
          visuallyConfirmed: confirmed,
        });
        if (card) return card;
      }
    }
    return partRecordToCard(top, {
      confirmedPhotoId,
      matchConfidence,
      visuallyConfirmed: confirmed,
    });
  }

  return null;
}

export function formatPartsCardMarkdown(card: StormAiPartsCard): string {
  return card.summary;
}

export function parsePartsCardFromAttachments(raw: unknown): StormAiPartsCard | null {
  if (!Array.isArray(raw)) return null;
  for (const item of raw) {
    const row = asRecord(item);
    if (!row || row.kind !== "parts_card") continue;
    return partRecordToCard(
      { ...row, id: row.partId ?? row.id },
      {
        confirmedPhotoId:
          typeof row.confirmedPhotoId === "string" ? row.confirmedPhotoId : null,
        matchConfidence:
          typeof row.matchConfidence === "number" ? row.matchConfidence : null,
        visuallyConfirmed: row.visuallyConfirmed === true,
      }
    );
  }
  return null;
}
