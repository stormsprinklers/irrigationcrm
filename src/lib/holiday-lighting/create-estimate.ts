import { EstimateStatus, HolidayLightingQuoteStatus } from "@prisma/client";
import { allocateEstimateNumber } from "@/lib/estimates/numbering";
import { computeEstimateExpiry } from "@/lib/estimates/queries";
import { prisma } from "@/lib/prisma";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import { loadHolidayPriceLookup } from "./catalog";
import { applyMarginToLines, computeHolidayQuotePricing } from "./pricing";
import { buildHolidayStrandMap } from "./strand-map";
import {
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

  if (priced.lines.length === 0) {
    throw new Error("Add measurements or placements before creating an estimate");
  }

  const expiresAt = computeEstimateExpiry(company.estimateExpiryDays);
  const estimateNumber = await allocateEstimateNumber(params.companyId);

  const address = [quote.address, quote.city, quote.state, quote.zip]
    .filter(Boolean)
    .join(", ");
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
        address,
        marginPct: selections.marginPct,
        strandMap,
      },
    },
  });

  const purchaseOption = await prisma.estimateOption.create({
    data: {
      estimateId: estimate.id,
      letter: selections.includeLease ? "A" : null,
      label: "Purchase",
      sortOrder: 0,
    },
  });

  const purchaseLines = applyMarginToLines(priced.lines, "purchaseTotal", priced.marginPct);
  await prisma.estimateLineItem.createMany({
    data: purchaseLines.map((line, index) => ({
      estimateId: estimate.id,
      optionId: purchaseOption.id,
      priceBookItemId: line.priceBookItemId ?? null,
      name: line.name,
      description: line.description,
      quantity: 1,
      unitPrice: line.customerTotal,
      unit: "each",
      total: line.customerTotal,
      sortOrder: index,
    })),
  });

  let leaseOptionId: string | null = null;
  let leaseTotal = 0;
  if (selections.includeLease) {
    const leaseOption = await prisma.estimateOption.create({
      data: {
        estimateId: estimate.id,
        letter: "B",
        label: "Lease (season)",
        sortOrder: 1,
      },
    });
    leaseOptionId = leaseOption.id;
    const leaseLines = applyMarginToLines(priced.lines, "leaseTotal", priced.marginPct);
    leaseTotal = leaseLines.reduce((s, l) => s + l.customerTotal, 0);
    await prisma.estimateLineItem.createMany({
      data: leaseLines.map((line, index) => ({
        estimateId: estimate.id,
        optionId: leaseOption.id,
        priceBookItemId: line.priceBookItemId ?? null,
        name: line.name,
        description: `${line.description} · Seasonal lease`,
        quantity: 1,
        unitPrice: line.customerTotal,
        unit: "each",
        total: line.customerTotal,
        sortOrder: index,
      })),
    });
  }

  const purchaseTotal = purchaseLines.reduce((s, l) => s + l.customerTotal, 0);

  await prisma.estimateOption.update({
    where: { id: purchaseOption.id },
    data: { subtotal: purchaseTotal, total: purchaseTotal },
  });
  if (leaseOptionId) {
    await prisma.estimateOption.update({
      where: { id: leaseOptionId },
      data: { subtotal: leaseTotal, total: leaseTotal },
    });
  }

  await prisma.estimate.update({
    where: { id: estimate.id },
    data: {
      selectedOptionId: purchaseOption.id,
      subtotal: purchaseTotal,
      total: purchaseTotal,
      premiumOptionTotal: selections.includeLease ? leaseTotal : null,
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
      // Attachment schema may require extra fields — preview still lives on designExportMetadata.
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
