import { getOpenAIApiKey } from "@/lib/openai/client";
import { prisma } from "@/lib/prisma";
import { getEstimateForCompany } from "@/lib/estimates/queries";
import { ensureEstimateOptions } from "@/lib/estimates/options";
import { toNumber } from "@/lib/visits/totals";

type MediaPick = { id: string; fileName: string; alt: string | null; blobUrl: string };

function scoreAsset(asset: MediaPick, haystack: string) {
  const words = haystack
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length > 3);
  const text = `${asset.alt ?? ""} ${asset.fileName}`.toLowerCase();
  return words.reduce((score, word) => (text.includes(word) ? score + 1 : score), 0);
}

function pickAssetFallback(assets: MediaPick[], haystack: string) {
  if (!assets.length) return null;
  const ranked = [...assets].sort((a, b) => scoreAsset(b, haystack) - scoreAsset(a, haystack));
  return ranked[0] ?? null;
}

async function generatePresentationCopy(params: {
  label: string;
  items: string[];
  assets: MediaPick[];
}): Promise<{ description: string; assetId: string | null }> {
  const haystack = `${params.label} ${params.items.join(" ")}`;
  const fallbackAsset = pickAssetFallback(params.assets, haystack);
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
            "You write short customer-facing irrigation/landscape service option copy. Return JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            instruction:
              "Write 2-3 short paragraphs (about 40-90 words total) describing this estimate option for a homeowner. Plain language, no prices, no EST numbers. If a media catalog is provided, pick the single best matching photo id from it. If none fit, use null.",
            optionName: params.label,
            lineItems: params.items,
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

  for (const option of estimate.options) {
    if (!params.force && option.description?.trim() && option.photoUrl) continue;
    const items = estimate.lineItems
      .filter((item) => item.optionId === option.id || (!item.optionId && estimate.options.length === 1))
      .map((item) => item.name);
    const generated = await generatePresentationCopy({
      label: option.label,
      items,
      assets,
    });
    const asset = assets.find((row) => row.id === generated.assetId) ?? null;
    await prisma.estimateOption.update({
      where: { id: option.id },
      data: {
        ...(!option.description?.trim() || params.force
          ? { description: generated.description }
          : {}),
        ...(!option.photoUrl || params.force
          ? {
              photoUrl: asset?.blobUrl ?? option.photoUrl,
              photoAssetId: asset?.id ?? option.photoAssetId,
            }
          : {}),
      },
    });
  }

  return getEstimateForCompany(params.companyId, params.estimateId);
}

export function sortOptionsHighestFirst<T extends { total: number }>(options: T[]) {
  return [...options].sort((a, b) => b.total - a.total || 0);
}

export function optionMoney(total: unknown) {
  return toNumber(total);
}
