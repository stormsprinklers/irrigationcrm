import { fetchBlobBytes } from "@/lib/blob/download";
import { getOpenAIApiKey } from "@/lib/openai/client";
import { prisma } from "@/lib/prisma";
import { parseStoredAttachments } from "./attachments";

export type PartsSearchHit = {
  id: string;
  name: string;
  manufacturer: string | null;
  partNumber: string | null;
  section: string;
  visualDescription: string | null;
  technicalDescription: string | null;
  hasManual: boolean;
  manualUrl: string | null;
  manualKind: "pdf" | "link" | null;
  photoCount: number;
  photos: Array<{ id: string; url: string; fileName: string }>;
  matchedPhotoId?: string | null;
  visualConfidence?: number | null;
};

export type PartVisualMatch = {
  ran: boolean;
  confirmed: boolean;
  error?: boolean;
  partId: string | null;
  photoId: string | null;
  confidence: number | null;
  reason: string | null;
};

const MAX_CANDIDATE_PARTS = 6;
const MAX_PHOTOS_PER_PART = 2;
const CONFIRM_MIN = 0.62;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function visionModel() {
  return (
    process.env.STORM_AI_VISION_MODEL?.trim() ||
    process.env.STORM_AI_MODEL?.trim() ||
    "gpt-4o"
  );
}

async function blobToDataUrl(blobUrl: string, fallbackMime: string) {
  const { buffer, mimeType } = await fetchBlobBytes(blobUrl);
  const type = ALLOWED_IMAGE_TYPES.has(mimeType) ? mimeType : fallbackMime;
  return `data:${type};base64,${buffer.toString("base64")}`;
}

export async function latestTechnicianPhoto(conversationId: string) {
  const messages = await prisma.stormAiMessage.findMany({
    where: { conversationId, role: "user" },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { attachmentsJson: true },
  });
  for (const message of messages) {
    const attachments = parseStoredAttachments(message.attachmentsJson);
    if (attachments[0]) return attachments[0];
  }
  return null;
}

type CatalogShot = {
  label: string;
  partId: string;
  photoId: string;
  partName: string;
  dataUrl: string;
};

async function loadCatalogShots(companyId: string, partIds: string[]): Promise<CatalogShot[]> {
  if (!partIds.length) return [];
  const parts = await prisma.techAssistPart.findMany({
    where: { companyId, id: { in: partIds }, active: true },
    select: {
      id: true,
      name: true,
      photos: {
        orderBy: { sortOrder: "asc" },
        take: MAX_PHOTOS_PER_PART,
        select: { id: true, blobUrl: true, fileName: true, mimeType: true },
      },
    },
  });
  const byId = new Map(parts.map((part) => [part.id, part]));
  const jobs: Array<Promise<CatalogShot | null>> = [];
  let index = 1;
  for (const partId of partIds) {
    const part = byId.get(partId);
    if (!part?.photos.length) continue;
    for (const photo of part.photos) {
      const label = `C${index}`;
      index += 1;
      jobs.push(
        blobToDataUrl(photo.blobUrl, photo.mimeType || "image/jpeg")
          .then((dataUrl) => ({
            label,
            partId: part.id,
            photoId: photo.id,
            partName: part.name,
            dataUrl,
          }))
          .catch((err) => {
            console.error("[storm-ai] failed to load catalog photo for vision match", photo.id, err);
            return null;
          })
      );
    }
  }
  const loaded = await Promise.all(jobs);
  return loaded.filter((shot): shot is CatalogShot => shot != null);
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" } };

function parseMatchJson(raw: string): {
  partId: string | null;
  photoId: string | null;
  confidence: number;
  reason: string;
} | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
    return {
      partId: typeof parsed.partId === "string" && parsed.partId ? parsed.partId : null,
      photoId: typeof parsed.photoId === "string" && parsed.photoId ? parsed.photoId : null,
      confidence,
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 400) : "",
    };
  } catch {
    return null;
  }
}

async function askVisionToPick(techDataUrl: string, shots: CatalogShot[]) {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) return null;

  const catalogList = shots
    .map(
      (shot) =>
        `${shot.label}: partId=${shot.partId} photoId=${shot.photoId} name=${JSON.stringify(shot.partName)}`
    )
    .join("\n");

  const content: ContentPart[] = [
    {
      type: "text",
      text: `You compare one field photo of an irrigation part to labeled catalog photos.

Rules:
- The first image is the technician's photo.
- Later images are catalog photos with labels C1, C2, ...
- Pick the single catalog photo that is the same physical part (same body, ports, brand marks, connectors). Same category is not enough.
- If none is a clear match, set partId and photoId to null and use a low confidence.

Catalog:
${catalogList}

Return JSON only:
{"partId": string|null, "photoId": string|null, "confidence": number, "reason": string}`,
    },
    {
      type: "text",
      text: "Technician photo:",
    },
    {
      type: "image_url",
      image_url: { url: techDataUrl, detail: "high" },
    },
  ];

  for (const shot of shots) {
    content.push({
      type: "text",
      text: `${shot.label} catalog photo — ${shot.partName} (partId=${shot.partId}, photoId=${shot.photoId})`,
    });
    content.push({
      type: "image_url",
      image_url: { url: shot.dataUrl, detail: "low" },
    });
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: visionModel(),
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a parts-matching vision checker for an irrigation company. Compare images and return JSON only.",
        },
        { role: "user", content },
      ],
      max_tokens: 250,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || "Vision compare failed");
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return parseMatchJson(json.choices?.[0]?.message?.content ?? "");
}

export function rankPartsByVisualMatch(
  parts: PartsSearchHit[],
  match: PartVisualMatch
): PartsSearchHit[] {
  if (!match.partId) return parts;
  const winner = parts.find((part) => part.id === match.partId);
  if (!winner) return parts;
  const rest = parts.filter((part) => part.id !== match.partId);
  const tagged: PartsSearchHit = {
    ...winner,
    matchedPhotoId: match.photoId,
    visualConfidence: match.confidence,
    photos: match.photoId
      ? [
          ...winner.photos.filter((photo) => photo.id === match.photoId),
          ...winner.photos.filter((photo) => photo.id !== match.photoId),
        ]
      : winner.photos,
  };
  return [tagged, ...rest];
}

const NO_MATCH: PartVisualMatch = {
  ran: false,
  confirmed: false,
  partId: null,
  photoId: null,
  confidence: null,
  reason: null,
};

/** Re-rank text search hits by comparing the latest technician photo to catalog photos. */
export async function applyPartsVisionMatch(opts: {
  companyId: string;
  conversationId: string;
  parts: PartsSearchHit[];
}): Promise<{ parts: PartsSearchHit[]; visualMatch: PartVisualMatch }> {
  if (!opts.parts.length) {
    return { parts: opts.parts, visualMatch: NO_MATCH };
  }

  const techPhoto = await latestTechnicianPhoto(opts.conversationId);
  if (!techPhoto) {
    return { parts: opts.parts, visualMatch: NO_MATCH };
  }

  const candidateIds = opts.parts.slice(0, MAX_CANDIDATE_PARTS).map((part) => part.id);
  let shots: CatalogShot[] = [];
  let techDataUrl: string;
  try {
    techDataUrl = await blobToDataUrl(techPhoto.blobUrl, techPhoto.mimeType || "image/jpeg");
    shots = await loadCatalogShots(opts.companyId, candidateIds);
  } catch (err) {
    console.error("[storm-ai] vision match image load failed", err);
    return {
      parts: opts.parts,
      visualMatch: {
        ...NO_MATCH,
        ran: true,
        error: true,
        reason: "Could not load photos for visual compare",
      },
    };
  }

  if (!shots.length) {
    return {
      parts: opts.parts,
      visualMatch: {
        ...NO_MATCH,
        ran: true,
        reason: "Candidate parts have no library photos to compare",
      },
    };
  }

  try {
    const picked = await askVisionToPick(techDataUrl, shots);
    if (!picked) {
      return {
        parts: opts.parts,
        visualMatch: {
          ...NO_MATCH,
          ran: true,
          error: true,
          reason: "Vision compare returned no result",
        },
      };
    }

    const allowed = new Set(shots.map((shot) => `${shot.partId}:${shot.photoId}`));
    let partId = picked.partId;
    let photoId = picked.photoId;
    if (partId && photoId && !allowed.has(`${partId}:${photoId}`)) {
      const byPhoto = shots.find((shot) => shot.photoId === photoId);
      const byPart = shots.find((shot) => shot.partId === partId);
      if (byPhoto) {
        partId = byPhoto.partId;
        photoId = byPhoto.photoId;
      } else if (byPart) {
        partId = byPart.partId;
        photoId = byPart.photoId;
      } else {
        partId = null;
        photoId = null;
      }
    }

    const visualMatch: PartVisualMatch = {
      ran: true,
      confirmed: Boolean(partId && photoId && picked.confidence >= CONFIRM_MIN),
      partId,
      photoId,
      confidence: picked.confidence,
      reason: picked.reason || null,
    };

    return {
      parts: rankPartsByVisualMatch(opts.parts, visualMatch),
      visualMatch,
    };
  } catch (err) {
    console.error("[storm-ai] vision compare failed", err);
    return {
      parts: opts.parts,
      visualMatch: {
        ...NO_MATCH,
        ran: true,
        error: true,
        reason: "Vision compare failed",
      },
    };
  }
}

export function visualMatchNote(match: PartVisualMatch, partCount: number) {
  if (!match.ran) {
    return partCount === 0
      ? "No matching parts in the company parts library. Do not invent part specs or manuals."
      : "Use get_parts_info with a partId for the full write-up and manual link. Ground answers in these results only.";
  }
  if (match.error) {
    return "Visual compare could not run. Treat text matches as unverified guesses, not a confirmed ID.";
  }
  if (match.confirmed) {
    return `Visual compare confirmed partId ${match.partId} using catalog photo ${match.photoId} (confidence ${match.confidence}). Present that part. The matching library photo is already shown in the chat card — do not invent a link.`;
  }
  return "Visual compare did not confirm a library part from the technician photo. Do not present a text search hit as identified. Ask for a clearer photo or say you cannot confirm yet.";
}
