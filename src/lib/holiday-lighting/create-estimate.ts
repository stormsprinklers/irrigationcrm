import { EstimateStatus, HolidayLightingQuoteStatus } from "@prisma/client";
import { allocateEstimateNumber } from "@/lib/estimates/numbering";
import { computeEstimateExpiry } from "@/lib/estimates/queries";
import { prisma } from "@/lib/prisma";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import { loadHolidayPriceLookup } from "./catalog";
import { computeHolidayQuotePricing, holidayCustomerPackages, holidayOptionSummary } from "./pricing";
import { buildHolidayStrandMap } from "./strand-map";
import {
  HOLIDAY_PREVIEW_DISCLAIMER,
  applyHolidayCatalogPolicy,
  parseHolidayCatalog,
  parseHolidayMeasurements,
  parseHolidaySelections,
} from "./types";

export async function createEstimateFromHolidayQuote(params: {
  companyId: string;
  quoteId: string;
  userId?: string | null;
}) {
  const quote = await prisma.holidayLightingQuote.findFirst({
    where: { id: params.quoteId, companyId: params.companyId },
  });
  if (!quote) throw new Error("Quote not found");
  if (!quote.customerId) throw new Error("Link a customer before creating an estimate");

  const company = await prisma.company.findUnique({ where: { id: params.companyId } });
  if (!company) throw new Error("Company not found");

  const catalog = parseHolidayCatalog(company.holidayLightingCatalog);
  const measurements = parseHolidayMeasurements(quote.measurements);
  const selections = applyHolidayCatalogPolicy(
    parseHolidaySelections(quote.selections),
    catalog
  );
  const prices = await loadHolidayPriceLookup(params.companyId);
  const priced = computeHolidayQuotePricing({
    catalog,
    measurements,
    selections,
    prices,
  });

  if (priced.billedLengthFt <= 0 && priced.placementCount <= 0) {
    throw new Error("Add measurements or trees before creating an estimate");
  }

  const expiresAt = computeEstimateExpiry(company.estimateExpiryDays);
  const estimateNumber = await allocateEstimateNumber(params.companyId);
  const address = [quote.address, quote.city, quote.state, quote.zip]
    .filter(Boolean)
    .join(", ");
  const style =
    catalog.lightStyles.find((s) => s.key === selections.defaultLightStyleKey) ??
    catalog.lightStyles[0];
  const summary = holidayOptionSummary({
    billedLengthFt: priced.billedLengthFt,
    placementCount: priced.placementCount,
    styleLabel: style?.label ?? "holiday",
  });
  const strandMap = buildHolidayStrandMap({
    measurements,
    selections,
    catalog,
    pricedLines: priced.lines,
    address,
  });

  const estimate = await prisma.estimate.create({
    data: {
      companyId: params.companyId,
      customerId: quote.customerId,
      propertyId: quote.propertyId,
      estimateNumber,
      status: EstimateStatus.DRAFT,
      expiresAt,
      depositRequired: company.estimateDepositRequired,
      depositType: company.estimateDepositType,
      depositAmount: company.estimateDepositAmount,
      designExportMetadata: {
        source: "holiday-lighting-quote",
        quoteId: quote.id,
        previewImageUrl: quote.previewImageUrl,
        previewDisclaimer: HOLIDAY_PREVIEW_DISCLAIMER,
        address,
        billedLengthFt: priced.billedLengthFt,
        year1Total: priced.year1Total,
        reinstallTotal: priced.reinstallTotal,
        leaseTotal: priced.leaseTotal,
        permanentTotal: priced.permanentTotal,
        installKind: selections.installKind,
        lightStyleKey: selections.defaultLightStyleKey,
        strandMap,
      },
    },
  });

  const packages = holidayCustomerPackages({
    year1Total: priced.year1Total,
    reinstallTotal: priced.reinstallTotal,
    leaseTotal: priced.leaseTotal,
    permanentTotal: priced.permanentTotal,
    summary,
  });

  const createdOptions = [];
  for (const pack of packages) {
    const option = await prisma.estimateOption.create({
      data: {
        estimateId: estimate.id,
        letter: pack.letter,
        label: pack.label,
        description: pack.description,
        sortOrder: pack.sortOrder,
        subtotal: pack.total,
        total: pack.total,
        photoUrl: quote.previewImageUrl,
      },
    });
    await prisma.estimateLineItem.create({
      data: {
        estimateId: estimate.id,
        optionId: option.id,
        name: pack.label,
        description: pack.tagline,
        quantity: 1,
        unitPrice: pack.total,
        unit: "each",
        total: pack.total,
        sortOrder: 0,
      },
    });
    createdOptions.push({ ...pack, id: option.id });
  }

  const selected = createdOptions.find((o) => o.letter === "B") ?? createdOptions[0];
  const selectedTotal = selected?.total ?? priced.leaseTotal;

  await prisma.estimate.update({
    where: { id: estimate.id },
    data: {
      selectedOptionId: selected?.id ?? createdOptions[0]?.id,
      subtotal: selectedTotal,
      total: selectedTotal,
      premiumOptionTotal: priced.permanentTotal,
    },
  });

  if (quote.previewImageUrl) {
    try {
      await prisma.estimateAttachment.create({
        data: {
          estimateId: estimate.id,
          fileName: "lighting-preview.png",
          mimeType: "image/png",
          blobUrl: quote.previewImageUrl,
        },
      });
    } catch {
      // Preview still lives on designExportMetadata.
    }
  }

  await prisma.holidayLightingQuote.update({
    where: { id: quote.id },
    data: {
      estimateId: estimate.id,
      status: HolidayLightingQuoteStatus.ESTIMATE_CREATED,
    },
  });

  return prisma.estimate.findUniqueOrThrow({
    where: { id: estimate.id },
    include: {
      options: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
      customer: { select: { id: true, name: true, email: true, phone: true } },
    },
  });
}

export async function saveHolidayPreviewBlob(params: {
  companyId: string;
  quoteId: string;
  pngBase64: string;
}) {
  const buffer = Buffer.from(params.pngBase64, "base64");
  const blob = await uploadPrivateBlob(
    `company-holiday/${params.companyId}/${params.quoteId}-${Date.now()}-preview.png`,
    buffer,
    { contentType: "image/png" }
  );
  return blob.url;
}
