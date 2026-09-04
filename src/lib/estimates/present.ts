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

function isGenericOptionLabel(label: string) {
  const trimmed = label.trim();
  return !trimmed || /^option(?:\s+[a-z0-9]+)?$/i.test(trimmed);
}

function fallbackOptionTitle(label: string, uniqueItems: string[], items: string[]) {
  if (!isGenericOptionLabel(label)) return label.trim().slice(0, 60);
  const source = (uniqueItems[0] ?? items[0] ?? "Recommended Work").trim();
  return source.slice(0, 60);
}

function uniquifyTitle(title: string, taken: Set<string>) {
  const base = title.trim() || "Recommended Work";
  if (!taken.has(base.toLowerCase())) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`.toLowerCase())) n += 1;
  return `${base} ${n}`;
}

function polishOptionTitle(raw: unknown, fallback: string, taken: Set<string>) {
  const cleaned =
    typeof raw === "string"
      ? raw
          .replace(/[\r\n]+/g, " ")
          .replace(/^["'\s]+|["'\s]+$/g, "")
          .replace(/\s+/g, " ")
          .trim()
      : "";
  const candidate = cleaned.slice(0, 60);
  if (!candidate || isGenericOptionLabel(candidate)) {
    return uniquifyTitle(fallback, taken);
  }
  return uniquifyTitle(candidate, taken);
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
  takenTitles: string[];
}): Promise<{ title: string; description: string; assetId: string | null }> {
  const haystack = `${params.label} ${params.technicianNotes ?? ""} ${params.items.join(" ")}`;
  const uniqueHaystack = `${params.technicianNotes ?? ""} ${params.uniqueItems.join(" ")}`;
  const fallbackAsset = pickAssetFallback(params.assets, haystack, uniqueHaystack);
  const fallbackTitle = fallbackOptionTitle(params.label, params.uniqueItems, params.items);
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    return {
      title: fallbackTitle,
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
            "You write short customer-facing irrigation/landscape service option titles and copy. Return JSON only. Never reuse a photo across options — the catalog already excludes photos assigned to other options.",
        },
        {
          role: "user",
          content: JSON.stringify({
            instruction:
              "Write a professional customer-facing option title (2-6 words, Title Case) and 2-3 short paragraphs (about 40-90 words total) describing this estimate option for a homeowner. The title should sound like a named service package, not a draft label. Do not use Option A/B/C, prices, EST numbers, or slang. Make the title distinct from titlesAlreadyUsed. Prefer distinctiveLineItems and technicianNotes for what makes this option different. Plain language in the description. technicianNotes are staff context — use them as the primary guide for tone, scope, title, and which photo to pick, but never copy them verbatim; rewrite in homeowner-friendly language. Pick exactly one photo id from mediaCatalog. Strongly prefer a photo that matches distinctiveLineItems (work unique to this option vs the other options). If none of those fit, match technicianNotes, then the overall line items. If the catalog is empty or nothing fits, use null. Never invent an id.",
            optionName: params.label,
            titlesAlreadyUsed: params.takenTitles,
            technicianNotes: params.technicianNotes,
            lineItems: params.items,
            distinctiveLineItems: params.uniqueItems,
            mediaCatalog: catalog,
            format: { title: "string", description: "string", assetId: "string or null" },
          }),
        },
      ],
      max_tokens: 340,
    }),
  });

  if (!res.ok) {
    return {
      title: fallbackTitle,
      description: params.items.slice(0, 4).join(", ") || params.label,
      assetId: fallbackAsset?.id ?? null,
    };
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(raw) as { title?: unknown; description?: unknown; assetId?: unknown };
    const description =
      typeof parsed.description === "string" && parsed.description.trim()
        ? parsed.description.trim()
        : params.items.slice(0, 4).join(", ") || params.label;
    const requestedId = typeof parsed.assetId === "string" ? parsed.assetId : null;
    const assetId = catalog.some((asset) => asset.id === requestedId)
      ? requestedId
      : fallbackAsset?.id ?? null;
    return {
      title: typeof parsed.title === "string" ? parsed.title : fallbackTitle,
      description,
      assetId,
    };
  } catch {
    return {
      title: fallbackTitle,
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

type PresentLineItem = {
  optionId: string | null;
  name: string;
  priceBookItem: { imageUrl: string | null } | null;
};

function uniqueLineItemPhotoUrls(
  optionId: string,
  optionCount: number,
  lineItems: PresentLineItem[]
) {
  const uniqueNames = new Set(
    distinctiveItemNames(optionId, optionCount, lineItems).map(normalizeItemName)
  );
  const urls: string[] = [];
  for (const item of lineItems) {
    const onOption = item.optionId === optionId || (!item.optionId && optionCount === 1);
    if (!onOption || !uniqueNames.has(normalizeItemName(item.name))) continue;
    const url = item.priceBookItem?.imageUrl?.trim();
    if (url) urls.push(url);
  }
  return urls;
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
      lineItems: {
        orderBy: { sortOrder: "asc" },
        include: { priceBookItem: { select: { imageUrl: true } } },
      },
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
  const usedTitles = new Set<string>();
  const optionCount = estimate.options.length;
  const isHolidayQuote =
    estimate.designExportMetadata &&
    typeof estimate.designExportMetadata === "object" &&
    (estimate.designExportMetadata as Record<string, unknown>).source ===
      "holiday-lighting-quote";

  const photoKey = (option: { photoAssetId: string | null; photoUrl: string | null }) =>
    option.photoAssetId || option.photoUrl;

  for (const option of estimate.options) {
    const items = optionItemNames(option.id, optionCount, estimate.lineItems);
    const uniqueItems = distinctiveItemNames(option.id, optionCount, estimate.lineItems);
    const hasPhoto = Boolean(option.photoUrl);
    const duplicatePhoto =
      !isHolidayQuote &&
      Boolean(photoKey(option)) &&
      ((option.photoAssetId && usedAssetIds.has(option.photoAssetId)) ||
        (option.photoUrl && usedBlobUrls.has(option.photoUrl)));
    const needsPhoto = params.force || !hasPhoto || duplicatePhoto;
    const needsCopy = params.force || !option.description?.trim();
    const needsTitle = needsCopy || isGenericOptionLabel(option.label);
    const uniquePhotoUrl =
      uniqueLineItemPhotoUrls(option.id, optionCount, estimate.lineItems).find(
        (url) => !usedBlobUrls.has(url)
      ) ?? null;
    const available = assets.filter(
      (asset) => !usedAssetIds.has(asset.id) && !usedBlobUrls.has(asset.blobUrl)
    );
    const uniqueHaystack = `${option.internalNotes?.trim() ?? ""} ${uniqueItems.join(" ")}`;
    const uniqueCatalogAsset =
      uniquePhotoUrl
        ? available.find((row) => row.blobUrl === uniquePhotoUrl) ?? null
        : (() => {
            if (!uniqueItems.length) return null;
            const match = pickAssetFallback(available, uniqueHaystack, uniqueHaystack);
            return match && uniqueBoostForAsset(match, uniqueHaystack) > 0 ? match : null;
          })();
    const preferredUniqueUrl = uniquePhotoUrl ?? uniqueCatalogAsset?.blobUrl ?? null;
    const preferUniquePhoto = Boolean(preferredUniqueUrl) && option.photoUrl !== preferredUniqueUrl;

    if (!needsPhoto && !needsCopy && !needsTitle && !preferUniquePhoto) {
      if (option.photoAssetId) usedAssetIds.add(option.photoAssetId);
      if (option.photoUrl) usedBlobUrls.add(option.photoUrl);
      if (option.label.trim()) usedTitles.add(option.label.trim().toLowerCase());
      continue;
    }

    const uniquePhotoAsset = uniquePhotoUrl
      ? available.find((row) => row.blobUrl === uniquePhotoUrl) ?? uniqueCatalogAsset
      : uniqueCatalogAsset;

    const generated =
      needsCopy || needsTitle || (needsPhoto && !preferUniquePhoto)
        ? await generatePresentationCopy({
            label: option.label,
            items,
            uniqueItems,
            technicianNotes: option.internalNotes?.trim() || null,
            assets: available,
            takenTitles: [...usedTitles],
          })
        : null;
    const asset = preferUniquePhoto
      ? uniquePhotoAsset
      : available.find((row) => row.id === generated?.assetId) ?? null;

    const nextPhotoUrl = preferUniquePhoto
      ? preferredUniqueUrl
      : needsPhoto
        ? asset?.blobUrl ?? (duplicatePhoto ? null : option.photoUrl)
        : option.photoUrl;
    const nextPhotoAssetId = preferUniquePhoto
      ? uniquePhotoAsset?.id ?? null
      : needsPhoto
        ? asset?.id ?? (duplicatePhoto ? null : option.photoAssetId)
        : option.photoAssetId;
    const nextLabel =
      needsTitle && generated
        ? polishOptionTitle(
            generated.title,
            fallbackOptionTitle(option.label, uniqueItems, items),
            usedTitles
          )
        : option.label;

    await prisma.estimateOption.update({
      where: { id: option.id },
      data: {
        ...(needsTitle ? { label: nextLabel } : {}),
        ...(needsCopy && generated ? { description: generated.description } : {}),
        ...(preferUniquePhoto || needsPhoto
          ? {
              photoUrl: nextPhotoUrl,
              photoAssetId: nextPhotoAssetId,
            }
          : {}),
      },
    });

    if (nextLabel.trim()) usedTitles.add(nextLabel.trim().toLowerCase());

    if (nextPhotoAssetId) usedAssetIds.add(nextPhotoAssetId);
    if (nextPhotoUrl) usedBlobUrls.add(nextPhotoUrl);
  }

  return getEstimateForCompany(params.companyId, params.estimateId);
}

export function sortOptionsHighestFirst<T extends { total: number }>(options: T[]) {
  return [...options].sort((a, b) => b.total - a.total || 0);
}

export function optionMoney(total: unknown) {
  return toNumber(total);
}
