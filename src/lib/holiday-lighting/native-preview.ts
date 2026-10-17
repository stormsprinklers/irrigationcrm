import { prisma } from "@/lib/prisma";
import { applyHolidayCatalogPolicy, holidayDesignOptionsFromQuote, parseHolidayMeasurements, parseHolidaySelections, type HolidayLightingCatalog, type HolidayQuoteDesignOption } from "./types";

export class HolidayPreviewConflict extends Error {}
export async function persistNativeHolidayPreview(params: {
  companyId: string; quoteId: string; sourcePhotoUrl: string | null;
  option: HolidayQuoteDesignOption; catalog: HolidayLightingCatalog; previewImageUrl: string; expectedPreviewUrl?: string;
}) {
  const latest = await prisma.holidayLightingQuote.findFirst({ where: { id: params.quoteId, companyId: params.companyId } });
  if (!latest) throw new HolidayPreviewConflict("The quote is no longer available. Reload before trying again.");
  const selections = applyHolidayCatalogPolicy(parseHolidaySelections(latest.selections), params.catalog);
  const options = holidayDesignOptionsFromQuote({ measurements: parseHolidayMeasurements(latest.measurements), selections, catalog: params.catalog });
  const current = options.find(item => item.id === params.option.id);
  const signature = (item: HolidayQuoteDesignOption) => JSON.stringify({ measurements: item.measurements, selections: item.selections, previewPrompt: item.previewPrompt ?? "" });
  if (!current || (params.expectedPreviewUrl !== undefined && current.previewImageUrl !== params.expectedPreviewUrl) || signature(current) !== signature(params.option) || latest.sourcePhotoUrl !== params.sourcePhotoUrl) {
    throw new HolidayPreviewConflict("The design or photo changed while generating. Reload before trying again.");
  }
  selections.designOptions = options.map(item => item.id === params.option.id ? { ...item, previewImageUrl: params.previewImageUrl } : item);
  await prisma.holidayLightingQuote.update({
    where: { id: params.quoteId, companyId: params.companyId, updatedAt: latest.updatedAt },
    data: { selections, ...(selections.activeDesignOptionId === params.option.id || options.length === 1 ? { previewImageUrl: params.previewImageUrl } : {}) },
  });
}
