import { NextRequest, NextResponse } from "next/server";
import { EstimateStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalNotFoundResponse,
  portalUnauthorizedResponse,
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

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();
  if (!portalFeatureEnabled(ctx.company, "estimates")) {
    return portalForbiddenResponse("Estimates are not available in the portal");
  }

  const { id } = await params;
  const estimate = await prisma.estimate.findFirst({
    where: {
      companyId: ctx.companyId,
      customerId: ctx.customerId,
      OR: [{ id }, { publicToken: id }],
      status: { in: ["SENT"] },
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!estimate) return portalNotFoundResponse();

  const body = await request.json();
  const signature = body.signature as string | undefined;
  const selectedQuoteTier = (body.selectedQuoteTier as string | undefined) ?? "STANDARD";

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
    `estimates/${estimate.companyId}/${estimate.id}/signature-${Date.now()}.png`,
    buffer,
    { contentType: mimeType }
  );

  let total = toNumber(estimate.total);
  if (selectedQuoteTier === "PREMIUM" && estimate.premiumOptionTotal != null) {
    total = toNumber(estimate.premiumOptionTotal);
  }

  const updated = await prisma.estimate.update({
    where: { id: estimate.id },
    data: {
      signatureBlobUrl: blob.url,
      signedAt: new Date(),
      status: EstimateStatus.APPROVED,
      approvedAt: new Date(),
      selectedQuoteTier,
      total,
      subtotal: total,
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  void onEstimateClosed(estimate.id).catch(() => {});

  const { onReferralEstimateApproved } = await import("@/lib/referrals/conversion");
  void onReferralEstimateApproved({
    companyId: estimate.companyId,
    estimateId: estimate.id,
    customerId: estimate.customerId,
  }).catch(() => {});

  const depositAmount = computeDepositAmount(updated);
  let depositCheckoutUrl: string | null = null;

  if (depositAmount > 0) {
    const origin = request.nextUrl.origin;
    const slug = ctx.company.portalSlug ?? "portal";
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
