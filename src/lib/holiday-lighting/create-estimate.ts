import { DiscountType, EstimateStatus, HolidayLightingQuoteStatus } from "@prisma/client";
import { allocateEstimateNumber } from "@/lib/estimates/numbering";
import { computeEstimateExpiry } from "@/lib/estimates/queries";
import { prisma } from "@/lib/prisma";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import { loadHolidayPriceLookup } from "./catalog";
import {
  computeHolidayQuotePricing,
  HOLIDAY_BUY_DETAIL,
  HOLIDAY_LABOR_ONLY_DETAIL,
  HOLIDAY_LABOR_ONLY_DISCLAIMER,
  HOLIDAY_LEASE_DETAIL,
  HOLIDAY_PERMANENT_DETAIL,
  HOLIDAY_INCLUDED_LINES,
  HOLIDAY_PERMANENT_INCLUDED_LINES,
  holidayDetailedBuyLines,
  holidayDetailedLaborOnlyLines,
  holidayOptionSummary,
} from "./pricing";
import { buildHolidayStrandMap } from "./strand-map";
import {
  HOLIDAY_PREVIEW_DISCLAIMER,
  applyHolidayCatalogPolicy,
  holidayDesignOptionsFromQuote,
  parseHolidayCatalog,
  parseHolidayMeasurements,
  parseHolidaySelections,
} from "./types";

export async function createEstimateFromHolidayQuote(params: {
  companyId: string;
  quoteId: string;
  userId?: string | null;
  mode?: "revise" | "new";
}) {
  const quote = await prisma.holidayLightingQuote.findFirst({
    where: { id: params.quoteId, companyId: params.companyId },
  });
  if (!quote) throw new Error("Quote not found");
  if (!quote.customerId) throw new Error("Link a customer before creating an estimate");

  const company = await prisma.company.findUnique({ where: { id: params.companyId } });
  if (!company) throw new Error("Company not found");

  const catalog = parseHolidayCatalog(company.holidayLightingCatalog);
  const rootMeasurements = parseHolidayMeasurements(quote.measurements);
  const rootSelections = applyHolidayCatalogPolicy(parseHolidaySelections(quote.selections), catalog);
  const designs = holidayDesignOptionsFromQuote({
    measurements: rootMeasurements,
    selections: rootSelections,
    catalog,
  });
  const prices = await loadHolidayPriceLookup(params.companyId);
  const address = [quote.address, quote.city, quote.state, quote.zip].filter(Boolean).join(", ");
  const prepared = designs.map((design, index) => {
    const selections = applyHolidayCatalogPolicy(design.selections, catalog);
    const measurements = parseHolidayMeasurements(design.measurements);
    const priced = computeHolidayQuotePricing({ catalog, measurements, selections, prices });
    if (priced.billedLengthFt <= 0 && priced.placementCount <= 0) {
      throw new Error(`${design.label || `Option ${index + 1}`} needs roofline measurements or trees/bushes`);
    }
    const style = catalog.lightStyles.find((item) => item.key === selections.defaultLightStyleKey) ?? catalog.lightStyles[0];
    const key = style?.kind === "permanent"
      ? "permanent" as const
      : selections.pricingMode === "lease" || selections.pricingMode === "labor"
        ? selections.pricingMode
        : "buy" as const;
    const defaultLabel = key === "permanent"
      ? "Permanent Lights"
      : key === "labor"
        ? "Labor Only"
        : key === "lease"
          ? "Lease Lights"
          : "Lights + Labor";
    const label = design.label.trim() || defaultLabel;
    const summary = holidayOptionSummary({
      placementCount: priced.placementCount,
      styleLabel: style?.kind === "permanent"
        ? style.label
        : `${style?.label ?? "holiday"} ${selections.defaultColorPattern ?? "Warm White"}`,
    });
    const detail = priced.optionDetails[key];
    const tagline = key === "buy"
      ? `Future Years: ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(priced.reinstallTotal)}`
      : key === "lease"
        ? "No Commitments!"
        : key === "labor"
          ? "Customer-supplied lights"
          : "Fit Your Vibe Year-Round";
    const detailCopy = key === "buy"
      ? HOLIDAY_BUY_DETAIL
      : key === "lease"
        ? HOLIDAY_LEASE_DETAIL
        : key === "labor"
          ? HOLIDAY_LABOR_ONLY_DETAIL
          : HOLIDAY_PERMANENT_DETAIL;
    return {
      design,
      selections,
      measurements,
      priced,
      key,
      label,
      tagline,
      description: [tagline, selections.notes?.trim(), `${detailCopy} ${summary}`]
        .filter(Boolean)
        .join("\n\n"),
      detail,
      strandMap: buildHolidayStrandMap({ measurements, selections, catalog, pricedLines: priced.lines, address }),
    };
  });

  const metadata = {
    source: "holiday-lighting-quote",
    quoteId: quote.id,
    previewImageUrl: quote.previewImageUrl,
    previewDisclaimer: HOLIDAY_PREVIEW_DISCLAIMER,
    address,
    strandMap: prepared[0]?.strandMap,
    options: prepared.map((item, index) => ({
      id: item.design.id,
      letter: String.fromCharCode(65 + index),
      label: item.label,
      pricingMode: item.key,
      billedLengthFt: item.priced.billedLengthFt,
      placementCount: item.priced.placementCount,
      total: item.detail.total,
      reinstallTotal: item.priced.reinstallTotal,
      lightStyleKey: item.selections.defaultLightStyleKey,
      colorPattern: item.selections.defaultColorPattern,
      strandMap: item.strandMap,
    })),
  };
  const expiresAt = computeEstimateExpiry(company.estimateExpiryDays);
  const revising = params.mode === "revise" && Boolean(quote.estimateId);
  const existingEstimate = revising
    ? await prisma.estimate.findFirst({ where: { id: quote.estimateId!, companyId: params.companyId } })
    : null;
  if (revising && !existingEstimate) throw new Error("The existing estimate could not be found");
  if (
    existingEstimate &&
    (existingEstimate.status === EstimateStatus.APPROVED || existingEstimate.status === EstimateStatus.CONVERTED)
  ) {
    throw new Error("Approved or converted estimates cannot be revised. Create a new estimate instead.");
  }

  const estimate = existingEstimate
    ? await prisma.estimate.update({
        where: { id: existingEstimate.id },
        data: {
          customerId: quote.customerId,
          propertyId: quote.propertyId,
          visitId: quote.visitId,
          expiresAt,
          depositRequired: company.estimateDepositRequired,
          depositType: company.estimateDepositType,
          depositAmount: company.estimateDepositAmount,
          depositThreshold: company.estimateDepositThreshold,
          selectedOptionId: null,
          designExportMetadata: metadata,
        },
      })
    : await prisma.estimate.create({
        data: {
          companyId: params.companyId,
          customerId: quote.customerId,
          propertyId: quote.propertyId,
          visitId: quote.visitId,
          estimateNumber: await allocateEstimateNumber(params.companyId),
          status: EstimateStatus.DRAFT,
          expiresAt,
          depositRequired: company.estimateDepositRequired,
          depositType: company.estimateDepositType,
          depositAmount: company.estimateDepositAmount,
          depositThreshold: company.estimateDepositThreshold,
          designExportMetadata: metadata,
        },
      });

  if (existingEstimate) {
    await prisma.discount.deleteMany({ where: { estimateId: estimate.id } });
    await prisma.estimateLineItem.deleteMany({ where: { estimateId: estimate.id } });
    await prisma.estimateOption.deleteMany({ where: { estimateId: estimate.id } });
    await prisma.estimateAttachment.deleteMany({
      where: { estimateId: estimate.id, fileName: "lighting-preview.png" },
    });
  }

  const createdOptions = [];
  for (const [index, pack] of prepared.entries()) {
    const { key, detail, priced, selections } = pack;
    const adjustment = selections.optionAdjustments?.[key];
    const option = await prisma.estimateOption.create({
      data: {
        estimateId: estimate.id,
        letter: String.fromCharCode(65 + index),
        label: pack.label,
        description: pack.description,
        sortOrder: index,
        subtotal: detail.subtotal,
        discountTotal: detail.discountTotal,
        total: detail.total,
        photoUrl: quote.previewImageUrl,
      },
    });
    if (key === "buy" || key === "labor") {
      const breakdown = key === "labor"
        ? holidayDetailedLaborOnlyLines({
            lines: priced.lines,
            targetSubtotal: detail.subtotal,
          })
        : holidayDetailedBuyLines({
            lines: priced.lines,
            targetSubtotal: detail.subtotal,
          });
      await prisma.estimateLineItem.createMany({
        data: breakdown.map((line, index) => ({
          estimateId: estimate.id,
          optionId: option.id,
          name: line.name,
          description: line.description,
          quantity: 1,
          unitPrice: line.total,
          unit: "each",
          total: line.total,
          sortOrder: index,
        })),
      });
    } else {
      await prisma.estimateLineItem.create({
        data: {
          estimateId: estimate.id,
          optionId: option.id,
          name: pack.label,
          description: pack.tagline,
          quantity: 1,
          unitPrice: detail.subtotal,
          unit: "each",
          total: detail.subtotal,
          sortOrder: 0,
        },
      });
    }
    if (key !== "labor") {
      const includedLines = key === "permanent"
        ? HOLIDAY_PERMANENT_INCLUDED_LINES
        : HOLIDAY_INCLUDED_LINES;
      await prisma.estimateLineItem.createMany({
        data: includedLines.map((line, index) => ({
          estimateId: estimate.id,
          optionId: option.id,
          name: line.name,
          description: line.description,
          quantity: 1,
          unitPrice: 0,
          unit: "included",
          total: 0,
          sortOrder: (key === "buy" ? priced.lines.length * 2 : 1) + index + 1,
        })),
      });
    } else {
      await prisma.estimateLineItem.create({
        data: {
          estimateId: estimate.id,
          optionId: option.id,
          name: "Customer-supplied materials",
          description: HOLIDAY_LABOR_ONLY_DISCLAIMER,
          quantity: 1,
          unitPrice: 0,
          unit: "included",
          total: 0,
          sortOrder: priced.lines.length + 100,
        },
      });
    }
    if (detail.discountTotal > 0 && adjustment) {
      await prisma.discount.create({
        data: {
          estimateId: estimate.id,
          optionId: option.id,
          label: adjustment.discountLabel?.trim() || "Holiday lighting discount",
          type: adjustment.discountType === "percent" ? DiscountType.PERCENT : DiscountType.FIXED,
          amount: adjustment.discountType === "percent"
            ? adjustment.discountAmount ?? 0
            : detail.discountTotal,
        },
      });
    }
    createdOptions.push({ ...pack, id: option.id });
  }

  const selected = createdOptions[0]!;
  const permanentTotal = createdOptions
    .filter((option) => option.key === "permanent")
    .reduce<number | null>((highest, option) => highest == null ? option.detail.total : Math.max(highest, option.detail.total), null);

  await prisma.estimate.update({
    where: { id: estimate.id },
    data: {
      selectedOptionId: selected.id,
      subtotal: selected.detail.subtotal,
      discountTotal: selected.detail.discountTotal,
      total: selected.detail.total,
      premiumOptionTotal: permanentTotal,
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
