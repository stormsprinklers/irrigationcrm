import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalNotFoundResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import { serializePortalEstimate } from "@/lib/portal/serializers";
import { computeApprovalPaymentAmount, computeDepositAmount } from "@/lib/estimates/booking";
import { onEstimateClosed } from "@/lib/notifications/estimate-followup";
import { notifyCustomerEstimateApproved } from "@/lib/notifications/estimate-approved";
import { toNumber } from "@/lib/visits/totals";
import type { PortalCompany } from "@/lib/portal/company";
import { findEstimateByPublicToken } from "@/lib/portal/public-estimate";
import { DiscountType, Prisma } from "@prisma/client";
import {
  calculateHolidayLeaseCommitmentPricing,
  holidayLeaseCommitmentDiscountPercent,
  isHolidayLeaseCommitmentDiscount,
  parseHolidayLeaseCommitmentYears,
  withHolidayLeaseCommitmentDescription,
  type HolidayLeaseCommitmentYears,
} from "@/lib/holiday-lighting/lease-commitment";
import {
  buildHolidaySubscriptionAgreement,
  isSeasonalHolidaySubscriptionOption,
} from "@/lib/holiday-lighting/subscription-agreement";
import { buildHolidaySubscriptionAgreementPdf } from "@/lib/holiday-lighting/subscription-agreement-pdf";

type Params = { params: Promise<{ id: string }> };

function holidayOptionMetadata(
  metadata: unknown,
  option: { letter: string | null; sortOrder: number }
) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const root = metadata as Record<string, unknown>;
  if (root.source !== "holiday-lighting-quote" || !Array.isArray(root.options)) return null;
  const options = root.options.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item)
  );
  return options.find((item) => item.letter === option.letter) ?? options[option.sortOrder] ?? null;
}

function updateHolidayLeaseMetadata(
  metadata: unknown,
  option: { letter: string | null; sortOrder: number },
  years: HolidayLeaseCommitmentYears,
  total: number
) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return metadata;
  const root = metadata as Record<string, unknown>;
  if (!Array.isArray(root.options)) return metadata;
  const discountPercent = holidayLeaseCommitmentDiscountPercent(years);
  return {
    ...root,
    options: root.options.map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const value = item as Record<string, unknown>;
      const matches = option.letter ? value.letter === option.letter : index === option.sortOrder;
      return matches
        ? {
            ...value,
            leaseContractYears: years,
            leaseContractDiscountPercent: discountPercent,
            total,
          }
        : item;
    }),
  };
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await requirePortalCustomer();

  let estimateId: string | null = null;
  let companyId: string | null = null;
  let customerId: string | null = null;
  let company: PortalCompany | { portalSlug: string | null; bookingSlug: string | null } | null =
    null;
  let premiumOptionTotal: unknown = null;
  let totalValue: unknown = null;
  let subtotalValue: unknown = null;
  let discountTotalValue: unknown = null;
  let designExportMetadata: unknown = null;

  if (ctx) {
    if (!portalFeatureEnabled(ctx.company, "estimates")) {
      return portalForbiddenResponse("Estimates are not available in the portal");
    }
    const estimate = await prisma.estimate.findFirst({
      where: {
        companyId: ctx.companyId,
        customerId: ctx.customerId,
        OR: [{ id }, { publicToken: id }],
        status: { in: ["SENT"] },
        signedAt: null,
      },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });
    if (estimate) {
      estimateId = estimate.id;
      companyId = estimate.companyId;
      customerId = estimate.customerId;
      company = ctx.company;
      premiumOptionTotal = estimate.premiumOptionTotal;
      totalValue = estimate.total;
      subtotalValue = estimate.subtotal;
      discountTotalValue = estimate.discountTotal;
      designExportMetadata = estimate.designExportMetadata;
    }
  } else {
    const estimate = await findEstimateByPublicToken(id);
    if (estimate?.status === "SENT" && !estimate.signedAt) {
      estimateId = estimate.id;
      companyId = estimate.companyId;
      customerId = estimate.customerId;
      company = estimate.company;
      premiumOptionTotal = estimate.premiumOptionTotal;
      totalValue = estimate.total;
      subtotalValue = estimate.subtotal;
      discountTotalValue = estimate.discountTotal;
      designExportMetadata = estimate.designExportMetadata;
    }
  }

  if (!estimateId || !companyId || !customerId || !company) {
    return portalNotFoundResponse();
  }

  const body = await request.json();
  const signature = body.signature as string | undefined;
  const selectedQuoteTier = (body.selectedQuoteTier as string | undefined) ?? "STANDARD";
  const selectedOptionId =
    typeof body.selectedOptionId === "string" ? body.selectedOptionId : null;
  const requestedLeaseContractYears =
    body.leaseContractYears == null
      ? null
      : ([1, 3, 5].includes(Number(body.leaseContractYears))
          ? (Number(body.leaseContractYears) as HolidayLeaseCommitmentYears)
          : null);

  if (body.leaseContractYears != null && requestedLeaseContractYears == null) {
    return NextResponse.json({ error: "Choose a valid lease commitment" }, { status: 400 });
  }

  if (!signature?.startsWith("data:image/")) {
    return NextResponse.json({ error: "signature must be a base64 data URL" }, { status: 400 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Signature storage is not configured" }, { status: 503 });
  }

  const selectedOption = selectedOptionId
    ? await prisma.estimateOption.findFirst({ where: { id: selectedOptionId, estimateId } })
    : null;
  if (selectedOptionId && !selectedOption) {
    return NextResponse.json({ error: "Choose a valid estimate option" }, { status: 400 });
  }
  const selectedHolidayMetadata = selectedOption
    ? holidayOptionMetadata(designExportMetadata, selectedOption)
    : null;
  const selectedOptionIsLease = selectedHolidayMetadata?.pricingMode === "lease";
  const selectedOptionIsSeasonalSubscription = isSeasonalHolidaySubscriptionOption(
    selectedHolidayMetadata
  );
  if (requestedLeaseContractYears != null && !selectedOptionIsLease) {
    return NextResponse.json(
      { error: "Lease commitments are available only for leased lights" },
      { status: 400 }
    );
  }

  const [header, base64Data] = signature.split(",");
  const mimeMatch = header.match(/data:(image\/\w+);base64/);
  const mimeType = mimeMatch?.[1] ?? "image/png";
  const buffer = Buffer.from(base64Data, "base64");
  if (!buffer.length || buffer.length > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "Signature image is invalid or too large" }, { status: 400 });
  }

  const signatureAcceptedAt = new Date();

  const blob = await uploadPrivateBlob(
    `estimates/${companyId}/${estimateId}/signature-${Date.now()}.png`,
    buffer,
    { contentType: mimeType }
  );

  let total = toNumber(totalValue as never);
  let subtotal = toNumber(subtotalValue as never);
  let discountTotal = toNumber(discountTotalValue as never);
  let nextMetadata = designExportMetadata;
  let selectedLeaseYears: HolidayLeaseCommitmentYears | null = null;
  let selectedLeasePricing:
    | ReturnType<typeof calculateHolidayLeaseCommitmentPricing>
    | null = null;
  let selectedDiscounts: Array<{
    id: string;
    optionId: string | null;
    label: string | null;
    type: string;
    amount: number;
  }> = [];
  let agreementAttachment:
    | { blobUrl: string; fileName: string; uploadedById: string }
    | null = null;

  if (selectedOption) {
    subtotal = toNumber(selectedOption.subtotal);
    discountTotal = toNumber(selectedOption.discountTotal);
    total = toNumber(selectedOption.total);
    if (selectedOptionIsLease) {
      selectedLeaseYears =
        requestedLeaseContractYears ??
        parseHolidayLeaseCommitmentYears(selectedHolidayMetadata?.leaseContractYears);
      const discounts = await prisma.discount.findMany({
        where: {
          estimateId,
          OR: [{ optionId: null }, { optionId: selectedOption.id }],
        },
      });
      selectedDiscounts = discounts.map((discount) => ({
        id: discount.id,
        optionId: discount.optionId,
        label: discount.label,
        type: discount.type,
        amount: toNumber(discount.amount),
      }));
      selectedLeasePricing = calculateHolidayLeaseCommitmentPricing({
        subtotal,
        years: selectedLeaseYears,
        discounts: selectedDiscounts,
      });
      discountTotal = selectedLeasePricing.discountTotal;
      total = selectedLeasePricing.total;
      nextMetadata = updateHolidayLeaseMetadata(
        designExportMetadata,
        selectedOption,
        selectedLeaseYears,
        total
      );
    }
  } else if (selectedQuoteTier === "PREMIUM" && premiumOptionTotal != null) {
    total = toNumber(premiumOptionTotal as never);
    subtotal = total;
    discountTotal = 0;
  }

  if (selectedOption && selectedOptionIsSeasonalSubscription) {
    const agreementRecord = await prisma.estimate.findUnique({
      where: { id: estimateId },
      select: {
        estimateNumber: true,
        createdAt: true,
        sentById: true,
        holidayLightingQuote: { select: { createdById: true } },
        customer: {
          select: {
            name: true,
            email: true,
            phone: true,
            address: true,
            city: true,
            state: true,
            zip: true,
          },
        },
        property: { select: { address: true, city: true, state: true, zip: true } },
        visit: { select: { startAt: true } },
        lineItems: {
          where: { OR: [{ optionId: null }, { optionId: selectedOption.id }] },
          select: { optionId: true, name: true, unit: true, total: true },
        },
      },
    });
    if (!agreementRecord) return portalNotFoundResponse();
    const agreement = buildHolidaySubscriptionAgreement({
      estimateNumber: agreementRecord.estimateNumber,
      selectedOptionId: selectedOption.id,
      optionLabel: selectedOption.label,
      optionTotal: total,
      optionMetadata: selectedHolidayMetadata,
      lineItems: agreementRecord.lineItems.map((item) => ({
        ...item,
        total: toNumber(item.total),
      })),
      customer: agreementRecord.customer,
      property: agreementRecord.property,
      addressFallback:
        nextMetadata && typeof nextMetadata === "object" && !Array.isArray(nextMetadata) &&
        typeof (nextMetadata as Record<string, unknown>).address === "string"
          ? ((nextMetadata as Record<string, unknown>).address as string)
          : null,
      createdAt: agreementRecord.createdAt,
      effectiveAt: signatureAcceptedAt,
      installationAt: agreementRecord.visit?.startAt,
      promotionalPhotoConsent: true,
    });
    const fallbackUploader =
      agreementRecord.sentById || agreementRecord.holidayLightingQuote?.createdById
        ? null
        : await prisma.user.findFirst({
            where: { companyId, status: "ACTIVE" },
            orderBy: { createdAt: "asc" },
            select: { id: true },
          });
    const uploadedById =
      agreementRecord.sentById ??
      agreementRecord.holidayLightingQuote?.createdById ??
      fallbackUploader?.id;
    if (!uploadedById) {
      return NextResponse.json(
        { error: "No company user is available to store the signed agreement" },
        { status: 503 }
      );
    }
    const agreementPdf = await buildHolidaySubscriptionAgreementPdf({
      agreement,
      signatureImage: buffer,
      signedAt: signatureAcceptedAt,
      companyName: "Chestnut & Cheer",
    });
    const safeEstimateNumber = agreement.estimateNumber.replace(/[^a-zA-Z0-9._-]/g, "-");
    const agreementFileName = `Holiday Lighting Subscription Agreement - ${agreement.estimateNumber}.pdf`;
    const agreementBlob = await uploadPrivateBlob(
      `customers/${companyId}/${customerId}/${signatureAcceptedAt.getTime()}-holiday-subscription-agreement-${safeEstimateNumber}.pdf`,
      agreementPdf,
      { contentType: "application/pdf" }
    );
    agreementAttachment = {
      blobUrl: agreementBlob.url,
      fileName: agreementFileName,
      uploadedById,
    };
    const metadataRoot =
      nextMetadata && typeof nextMetadata === "object" && !Array.isArray(nextMetadata)
        ? (nextMetadata as Record<string, unknown>)
        : {};
    nextMetadata = {
      ...metadataRoot,
      subscriptionAgreementAcceptance: {
        acceptedAt: signatureAcceptedAt.toISOString(),
        selectedOptionId: selectedOption.id,
        promotionalPhotoConsent: true,
        pdfBlobUrl: agreementBlob.url,
        agreement,
      },
    };
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (agreementAttachment) {
      await tx.customerAttachment.create({
        data: {
          customerId,
          uploadedById: agreementAttachment.uploadedById,
          blobUrl: agreementAttachment.blobUrl,
          fileName: agreementAttachment.fileName,
          mimeType: "application/pdf",
        },
      });
    }

    if (selectedOption && selectedLeaseYears && selectedLeasePricing) {
      const oldCommitmentDiscountIds = selectedDiscounts
        .filter(
          (discount) =>
            discount.optionId === selectedOption.id &&
            isHolidayLeaseCommitmentDiscount(discount)
        )
        .map((discount) => discount.id);
      if (oldCommitmentDiscountIds.length) {
        await tx.discount.deleteMany({ where: { id: { in: oldCommitmentDiscountIds } } });
      }
      if (selectedLeasePricing.contractDiscountPercent > 0) {
        await tx.discount.create({
          data: {
            estimateId,
            optionId: selectedOption.id,
            label: `${selectedLeaseYears}-year commitment discount`,
            type: DiscountType.PERCENT,
            amount: selectedLeasePricing.contractDiscountPercent,
          },
        });
      }
      await tx.estimateOption.update({
        where: { id: selectedOption.id },
        data: {
          description: withHolidayLeaseCommitmentDescription(
            selectedOption.description,
            selectedLeaseYears
          ),
          discountTotal,
          total,
          declinedAt: null,
        },
      });
      await tx.estimateLineItem.updateMany({
        where: {
          estimateId,
          optionId: selectedOption.id,
          name: "3-year parts and labor warranty",
        },
        data: {
          name: "Lifetime parts and labor warranty",
          description:
            "For as long as your lease remains active, if anything goes wrong, we will make it right at no cost to you.",
        },
      });
    } else if (selectedOption) {
      await tx.estimateOption.updateMany({
        where: { estimateId, id: selectedOption.id },
        data: { declinedAt: null },
      });
    }

    return tx.estimate.update({
      where: { id: estimateId },
      data: {
        signatureBlobUrl: blob.url,
        signedAt: signatureAcceptedAt,
        // Acceptance is recorded now, but the estimate remains SENT until Stripe
        // confirms either a payment or a saved card.
        approvedAt: null,
        selectedQuoteTier,
        ...(selectedOptionId ? { selectedOptionId } : {}),
        total,
        subtotal,
        discountTotal,
        ...(nextMetadata
          ? { designExportMetadata: nextMetadata as Prisma.InputJsonValue }
          : {}),
      },
      include: {
        lineItems: {
          orderBy: { sortOrder: "asc" },
          include: { priceBookItem: { select: { type: true } } },
        },
        options: { orderBy: { sortOrder: "asc" } },
        discounts: true,
        visit: {
          select: {
            id: true,
            title: true,
            startAt: true,
            endAt: true,
            assignedUser: { select: { name: true, photoUrl: true, title: true } },
          },
        },
        company: {
          select: {
            estimateWarrantyText: true,
            deferredVisitDepositThreshold: true,
          },
        },
      },
    });
  });

  void onEstimateClosed(estimateId).catch(() => {});
  after(() =>
    notifyCustomerEstimateApproved(estimateId).catch((error) =>
      console.error("Estimate approval staff notification failed", error)
    )
  );

  const currentDepositPolicy = {
    ...updated,
    depositThreshold: updated.company.deferredVisitDepositThreshold,
  };
  const depositAmount = computeDepositAmount(currentDepositPolicy);
  const paymentAmount = computeApprovalPaymentAmount(currentDepositPolicy);

  return NextResponse.json({
    estimate: serializePortalEstimate(updated),
    depositAmount,
    paymentAmount,
  });
}
