import { getPartsInfoDetail } from "@/lib/storm-ai/parts-info";

export type StormAiPartsCard = {
  kind: "parts_card";
  partId: string;
  name: string;
  manufacturer: string | null;
  partNumber: string | null;
  section: string | null;
  visualDescription: string | null;
  technicalDescription: string | null;
  manualUrl: string | null;
  manualKind: "pdf" | "link" | null;
  photos: Array<{ id?: string; url: string; fileName: string }>;
};

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

export function partRecordToCard(part: Record<string, unknown>): StormAiPartsCard | null {
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

  return {
    kind: "parts_card",
    partId: id,
    name,
    manufacturer: typeof part.manufacturer === "string" ? part.manufacturer : null,
    partNumber: typeof part.partNumber === "string" ? part.partNumber : null,
    section,
    visualDescription:
      typeof part.visualDescription === "string" ? part.visualDescription : null,
    technicalDescription:
      typeof part.technicalDescription === "string" ? part.technicalDescription : null,
    manualUrl: typeof part.manualUrl === "string" ? part.manualUrl : null,
    manualKind,
    photos: photos as Array<{ id?: string; url: string; fileName: string }>,
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
    const top = asRecord(data.parts[0]);
    if (!top) return null;
    const topId = typeof top.id === "string" ? top.id : null;
    if (topId) {
      const detail = await getPartsInfoDetail(companyId, topId);
      if (detail) {
        const card = partRecordToCard(detail as unknown as Record<string, unknown>);
        if (card) return card;
      }
    }
    return partRecordToCard(top);
  }

  return null;
}

export function formatPartsCardMarkdown(card: StormAiPartsCard): string {
  const lines: string[] = [`**${card.name}**`];
  const meta = [card.manufacturer, card.partNumber, card.section].filter(Boolean);
  if (meta.length) lines.push(meta.join(" · "));
  if (card.visualDescription) lines.push(`\n${card.visualDescription}`);
  if (card.technicalDescription) lines.push(`\n${card.technicalDescription}`);
  if (card.manualUrl) {
    lines.push(`\n[Open manual](${card.manualUrl})`);
  }
  return lines.join("\n").trim();
}

export function parsePartsCardFromAttachments(raw: unknown): StormAiPartsCard | null {
  if (!Array.isArray(raw)) return null;
  for (const item of raw) {
    const row = asRecord(item);
    if (!row || row.kind !== "parts_card") continue;
    return partRecordToCard({ ...row, id: row.partId ?? row.id });
  }
  return null;
}
