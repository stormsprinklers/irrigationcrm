import { getOpenAIApiKey } from "@/lib/openai/client";
import { prisma } from "@/lib/prisma";
import { getEstimateForCompany } from "@/lib/estimates/queries";
import { ensureEstimateOptions } from "@/lib/estimates/options";
import { toNumber } from "@/lib/visits/totals";

type MediaPick = { id: string; fileName: string; alt: string | null; blobUrl: string };

function normalizeItemName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function scoreAsset(asset: MediaPick, haystack: string, uniqueBoost = 0) {
  const words = haystack
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length > 3);
  const text = `${asset.alt ?? ""} ${asset.fileName}`.toLowerCase();
  return words.reduce((score, word) => (text.includes(word) ? score + 1 : score), 0) + uniqueBoost;
}

function uniqueBoostForAsset(asset: MediaPick, uniqueHaystack: string) {
  if (!uniqueHaystack.trim()) return 0;
  const uniqueScore = scoreAsset(asset, uniqueHaystack, 0);
  return uniqueScore * 3;
}

function pickAssetFallback(
  assets: MediaPick[],
  haystack: string,
  uniqueHaystack: string
) {
  if (!assets.length) return null;
  const ranked = [...assets].sort((a, b) => {
    const aScore = scoreAsset(a, haystack) + uniqueBoostForAsset(a, uniqueHaystack);
    const bScore = scoreAsset(b, haystack) + uniqueBoostForAsset(b, uniqueHaystack);
    return bScore - aScore;
  });
  return ranked[0] ?? null;
}

async function generatePresentationCopy(params: {
  label: string;
  items: string[];
  uniqueItems: string[];
  technicianNotes: string | null;
  assets: MediaPick[];
}): Promise<{ description: string; assetId: string | null }> {
  const haystack = `${params.label} ${params.technicianNotes ?? ""} ${params.items.join(" ")}`;
  const uniqueHaystack = `${params.technicianNotes ?? ""} ${params.uniqueItems.join(" ")}`;
  const fallbackAsset = pickAssetFallback(params.assets, haystack, uniqueHaystack);
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    return {
      description: params.items.slice(0, 4).join(", ") || params.label,
      assetId: fallbackAsset?.id ?? null,
    };
  }

  const catalog = params.assets.slice(0, 80).map((asset) => ({
    id: asset.id,
    fileName: asset.fileName,
    alt: asset.alt,
  }));

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You write short customer-facing irrigation/landscape service option copy. Return JSON only. Never reuse a photo across options — the catalog already excludes photos assigned to other options.",
        },
        {
          role: "user",
          content: JSON.stringify({
            instruction:
              "Write 2-3 short paragraphs (about 40-90 words total) describing this estimate option for a homeowner. Plain language, no prices, no EST numbers. technicianNotes are staff context — use them as the primary guide for tone, scope, and which photo to pick, but never copy them verbatim; rewrite in homeowner-friendly language. Pick exactly one photo id from mediaCatalog. Prefer a photo that matches technicianNotes and distinctiveLineItems (work unique to this option vs the other options). If none of those fit, match the overall line items. If the catalog is empty or nothing fits, use null. Never invent an id.",
            optionName: params.label,
            technicianNotes: params.technicianNotes,
            lineItems: params.items,
            distinctiveLineItems: params.uniqueItems,
            mediaCatalog: catalog,
            format: { description: "string", assetId: "string or null" },
          }),
        },
      ],
      max_tokens: 280,
    }),
  });

  if (!res.ok) {
    return {
      description: params.items.slice(0, 4).join(", ") || params.label,
      assetId: fallbackAsset?.id ?? null,
    };
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(raw) as { description?: unknown; assetId?: unknown };
    const description =
      typeof parsed.description === "string" && parsed.description.trim()
        ? parsed.description.trim()
        : params.items.slice(0, 4).join(", ") || params.label;
    const requestedId = typeof parsed.assetId === "string" ? parsed.assetId : null;
    const assetId = catalog.some((asset) => asset.id === requestedId)
      ? requestedId
      : fallbackAsset?.id ?? null;
    return { description, assetId };
  } catch {
    return {
      description: params.items.slice(0, 4).join(", ") || params.label,
      assetId: fallbackAsset?.id ?? null,
    };
  }
}

function optionItemNames(
  optionId: string,
  optionCount: number,
  lineItems: Array<{ optionId: string | null; name: string }>
) {
  return lineItems
    .filter((item) => item.optionId === optionId || (!item.optionId && optionCount === 1))
    .map((item) => item.name);
}

function distinctiveItemNames(
  optionId: string,
  optionCount: number,
  lineItems: Array<{ optionId: string | null; name: string }>
) {
  const own = optionItemNames(optionId, optionCount, lineItems);
  const otherNames = new Set(
    lineItems
      .filter((item) => item.optionId && item.optionId !== optionId)
      .map((item) => normalizeItemName(item.name))
  );
  return own.filter((name) => !otherNames.has(normalizeItemName(name)));
}

export async function prepareEstimatePresentation(params: {
  companyId: string;
  estimateId: string;
  force?: boolean;
}) {
  await ensureEstimateOptions(params.estimateId);
  const estimate = await prisma.estimate.findFirst({
    where: { id: params.estimateId, companyId: params.companyId },
    include: {
      options: { orderBy: { sortOrder: "asc" } },
      lineItems: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!estimate) return null;

  const assets = await prisma.companyMediaAsset.findMany({
    where: { companyId: params.companyId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, fileName: true, alt: true, blobUrl: true },
  });

  const usedAssetIds = new Set<string>();
  const usedBlobUrls = new Set<string>();
  const optionCount = estimate.options.length;

  const photoKey = (option: { photoAssetId: string | null; photoUrl: string | null }) =>
    option.photoAssetId || option.photoUrl;

  for (const option of estimate.options) {
    const items = optionItemNames(option.id, optionCount, estimate.lineItems);
    const uniqueItems = distinctiveItemNames(option.id, optionCount, estimate.lineItems);
    const hasPhoto = Boolean(option.photoUrl);
    const duplicatePhoto =
      Boolean(photoKey(option)) &&
      ((option.photoAssetId && usedAssetIds.has(option.photoAssetId)) ||
        (option.photoUrl && usedBlobUrls.has(option.photoUrl)));
    const needsPhoto = params.force || !hasPhoto || duplicatePhoto;
    const needsCopy = params.force || !option.description?.trim();

    if (!needsPhoto && !needsCopy) {
      if (option.photoAssetId) usedAssetIds.add(option.photoAssetId);
      if (option.photoUrl) usedBlobUrls.add(option.photoUrl);
      continue;
    }

    const available = assets.filter(
      (asset) => !usedAssetIds.has(asset.id) && !usedBlobUrls.has(asset.blobUrl)
    );
    const generated = await generatePresentationCopy({
      label: option.label,
      items,
      uniqueItems,
      technicianNotes: option.internalNotes?.trim() || null,
      assets: available,
    });
    const asset = available.find((row) => row.id === generated.assetId) ?? null;

    await prisma.estimateOption.update({
      where: { id: option.id },
      data: {
        ...(needsCopy ? { description: generated.description } : {}),
        ...(needsPhoto
          ? {
              photoUrl: asset?.blobUrl ?? (duplicatePhoto ? null : option.photoUrl),
              photoAssetId: asset?.id ?? (duplicatePhoto ? null : option.photoAssetId),
            }
          : {}),
      },
    });

    const assignedId = needsPhoto ? asset?.id ?? option.photoAssetId : option.photoAssetId;
    const assignedUrl = needsPhoto
      ? asset?.blobUrl ?? (duplicatePhoto ? null : option.photoUrl)
      : option.photoUrl;
    if (assignedId) usedAssetIds.add(assignedId);
    if (assignedUrl) usedBlobUrls.add(assignedUrl);
  }

  return getEstimateForCompany(params.companyId, params.estimateId);
}

export function sortOptionsHighestFirst<T extends { total: number }>(options: T[]) {
  return [...options].sort((a, b) => b.total - a.total || 0);
}

export function optionMoney(total: unknown) {
  return toNumber(total);
}
