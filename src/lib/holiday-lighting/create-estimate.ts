import { DiscountType, EstimateStatus, HolidayLightingQuoteStatus } from "@prisma/client";
import { allocateEstimateNumber } from "@/lib/estimates/numbering";
import { computeEstimateExpiry } from "@/lib/estimates/queries";
import { prisma } from "@/lib/prisma";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import { loadHolidayPriceLookup } from "./catalog";
import {
  computeHolidayQuotePricing,
  HOLIDAY_LABOR_ONLY_DETAIL,
  HOLIDAY_LABOR_ONLY_DISCLAIMER,
  HOLIDAY_INCLUDED_LINES,
  holidayDetailedBuyLines,
  holidayDetailedLaborOnlyLines,
  holidayCustomerPackages,
  holidayOptionSummary,
} from "./pricing";
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
    styleLabel: style?.kind === "permanent"
      ? style.label
      : `${style?.label ?? "holiday"} ${selections.defaultColorPattern ?? "Warm White"}`,
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
      visitId: quote.visitId,
      estimateNumber,
      status: EstimateStatus.DRAFT,
      expiresAt,
      depositRequired: company.estimateDepositRequired,
      depositType: company.estimateDepositType,
      depositAmount: company.estimateDepositAmount,
      depositThreshold: company.estimateDepositThreshold,
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
        billingMode: selections.billingMode ?? "standard",
        lightStyleKey: selections.defaultLightStyleKey,
        colorPattern: selections.defaultColorPattern,
        strandMap,
      },
    },
  });

  const laborOnly = selections.billingMode === "labor_only" && style?.kind !== "permanent";
  const allPackages = holidayCustomerPackages({
    year1Total: priced.year1Total,
    reinstallTotal: priced.reinstallTotal,
    leaseTotal: priced.leaseTotal,
    permanentTotal: priced.permanentTotal,
    summary,
  });
  const packages = laborOnly
    ? [{
        letter: "A" as const,
        label: "Labor Only",
        tagline: "Customer-supplied lights",
        popular: false,
        description: `Customer-supplied lights\n\n${HOLIDAY_LABOR_ONLY_DETAIL} ${summary}`.trim(),
        total: priced.year1Total,
        sortOrder: 0,
      }]
    : style?.kind === "permanent"
      ? allPackages.filter((pack) => pack.letter === "C")
      : allPackages.filter((pack) => pack.letter !== "C");

  const createdOptions = [];
  for (const pack of packages) {
    const key = pack.letter === "A" ? "buy" : pack.letter === "B" ? "lease" : "permanent";
    const detail = priced.optionDetails[key];
    const adjustment = selections.optionAdjustments?.[key];
    const option = await prisma.estimateOption.create({
      data: {
        estimateId: estimate.id,
        letter: pack.letter,
        label: pack.label,
        description: pack.description,
        sortOrder: pack.sortOrder,
        subtotal: detail.subtotal,
        discountTotal: detail.discountTotal,
        total: pack.total,
        photoUrl: quote.previewImageUrl,
      },
    });
    if (key === "buy") {
      const breakdown = laborOnly
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
    if (!laborOnly) {
      await prisma.estimateLineItem.createMany({
        data: HOLIDAY_INCLUDED_LINES.map((line, index) => ({
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
            : Math.min(detail.subtotal, adjustment.discountAmount ?? 0),
        },
      });
    }
    createdOptions.push({ ...pack, id: option.id });
  }

  const selected = laborOnly
    ? createdOptions[0]
    : style?.kind === "permanent"
    ? createdOptions.find((o) => o.letter === "C") ?? createdOptions[0]
    : createdOptions.find((o) => o.letter === "B") ?? createdOptions[0];
  const selectedTotal = selected?.total ?? (laborOnly ? priced.year1Total : priced.leaseTotal);
  const selectedKey = selected?.letter === "A" ? "buy" : selected?.letter === "C" ? "permanent" : "lease";
  const selectedDetail = priced.optionDetails[selectedKey];

  await prisma.estimate.update({
    where: { id: estimate.id },
    data: {
      selectedOptionId: selected?.id ?? createdOptions[0]?.id,
      subtotal: selectedDetail.subtotal,
      discountTotal: selectedDetail.discountTotal,
      total: selectedTotal,
      premiumOptionTotal: laborOnly ? null : priced.permanentTotal,
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
