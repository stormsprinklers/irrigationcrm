import { prisma } from "@/lib/prisma";
import { applyHolidayCatalogPolicy, holidayDesignOptionsFromQuote, parseHolidayMeasurements, parseHolidaySelections, type HolidayLightingCatalog, type HolidayQuoteDesignOption } from "./types";

export class HolidayPreviewConflict extends Error {}

function previewSignature(item: HolidayQuoteDesignOption) {
  return JSON.stringify({
    selections: {
      defaultLightStyleKey: item.selections.defaultLightStyleKey,
      defaultColorPattern: item.selections.defaultColorPattern,
      installKind: item.selections.installKind,
    },
    photoMarkup: item.photoMarkup ?? [],
    previewPrompt: item.previewPrompt ?? "",
  });
}

function isOptimisticWriteConflict(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2025");
}

export async function persistNativeHolidayPreview(params: {
  companyId: string; quoteId: string; sourcePhotoUrl: string | null;
  option: HolidayQuoteDesignOption; catalog: HolidayLightingCatalog; previewImageUrl: string; expectedPreviewUrl?: string;
}) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const latest = await prisma.holidayLightingQuote.findFirst({ where: { id: params.quoteId, companyId: params.companyId } });
    if (!latest) throw new HolidayPreviewConflict("The quote is no longer available. Reload before trying again.");
    const selections = applyHolidayCatalogPolicy(parseHolidaySelections(latest.selections), params.catalog);
    const options = holidayDesignOptionsFromQuote({ measurements: parseHolidayMeasurements(latest.measurements), selections, catalog: params.catalog });
    const current = options.find(item => item.id === params.option.id);
    if (!current || (params.expectedPreviewUrl !== undefined && current.previewImageUrl !== params.expectedPreviewUrl) || previewSignature(current) !== previewSignature(params.option) || latest.sourcePhotoUrl !== params.sourcePhotoUrl) {
      throw new HolidayPreviewConflict("The lighting choices or photo changed while generating. Please generate the preview again.");
    }
    selections.designOptions = options.map(item => item.id === params.option.id ? { ...item, previewImageUrl: params.previewImageUrl } : item);
    try {
      await prisma.holidayLightingQuote.update({
        where: { id: params.quoteId, companyId: params.companyId, updatedAt: latest.updatedAt },
        data: { selections, ...(selections.activeDesignOptionId === params.option.id || options.length === 1 ? { previewImageUrl: params.previewImageUrl } : {}) },
      });
      return;
    } catch (error) {
      // Multiple option images can finish at nearly the same instant. Reload and
      // merge again instead of losing one preview to an optimistic-write race.
      if (!isOptimisticWriteConflict(error) || attempt === 3) throw error;
    }
  }
}
