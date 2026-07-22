import { NextRequest, NextResponse } from "next/server";
import { EstimateStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalNotFoundResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import { serializePortalEstimate } from "@/lib/portal/serializers";
import {
  computeDepositAmount,
  handleEstimateApprovedWithoutDeposit,
} from "@/lib/estimates/booking";
import { onEstimateClosed } from "@/lib/notifications/estimate-followup";
import { createEstimateDepositCheckout } from "@/lib/estimates/deposit-checkout";
import { toNumber } from "@/lib/visits/totals";
import { resolvePortalSlug, type PortalCompany } from "@/lib/portal/company";
import { findEstimateByPublicToken } from "@/lib/portal/public-estimate";

type Params = { params: Promise<{ id: string }> };

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
    }
  } else {
    const estimate = await findEstimateByPublicToken(id);
    if (estimate?.status === "SENT") {
      estimateId = estimate.id;
      companyId = estimate.companyId;
      customerId = estimate.customerId;
      company = estimate.company;
      premiumOptionTotal = estimate.premiumOptionTotal;
      totalValue = estimate.total;
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

  if (!signature?.startsWith("data:image/")) {
    return NextResponse.json({ error: "signature must be a base64 data URL" }, { status: 400 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Signature storage is not configured" }, { status: 503 });
  }

  const [header, base64Data] = signature.split(",");
  const mimeMatch = header.match(/data:(image\/\w+);base64/);
  const mimeType = mimeMatch?.[1] ?? "image/png";
  const buffer = Buffer.from(base64Data, "base64");

  const blob = await uploadPrivateBlob(
    `estimates/${companyId}/${estimateId}/signature-${Date.now()}.png`,
    buffer,
    { contentType: mimeType }
  );

  let total = toNumber(totalValue as never);
  if (selectedOptionId) {
    const option = await prisma.estimateOption.findFirst({
      where: { id: selectedOptionId, estimateId },
    });
    if (option) {
      total = toNumber(option.total);
    }
  } else if (selectedQuoteTier === "PREMIUM" && premiumOptionTotal != null) {
    total = toNumber(premiumOptionTotal as never);
  }

  const updated = await prisma.estimate.update({
    where: { id: estimateId },
    data: {
      signatureBlobUrl: blob.url,
      signedAt: new Date(),
      status: EstimateStatus.APPROVED,
      approvedAt: new Date(),
      selectedQuoteTier,
      ...(selectedOptionId ? { selectedOptionId } : {}),
      total,
      subtotal: total,
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
      company: { select: { estimateWarrantyText: true } },
    },
  });

  void onEstimateClosed(estimateId).catch(() => {});

  const { onReferralEstimateApproved } = await import("@/lib/referrals/conversion");
  void onReferralEstimateApproved({
    companyId,
    estimateId,
    customerId,
  }).catch(() => {});

  const depositAmount = computeDepositAmount(updated);
  let depositCheckoutUrl: string | null = null;

  if (depositAmount > 0) {
    const origin = request.nextUrl.origin;
    const slug = resolvePortalSlug(company) ?? "portal";
    const checkout = await createEstimateDepositCheckout({
      estimateId: updated.id,
      successUrl: `${origin}/portal/${slug}/estimates/${updated.publicToken}?deposit=success`,
      cancelUrl: `${origin}/portal/${slug}/estimates/${updated.publicToken}?deposit=cancelled`,
    });
    depositCheckoutUrl = checkout.url ?? null;
  } else {
    await handleEstimateApprovedWithoutDeposit(updated.id);
  }

  return NextResponse.json({
    estimate: serializePortalEstimate(updated),
    depositCheckoutUrl,
  });
}
