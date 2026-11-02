import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalNotFoundResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import { createEstimateDepositCheckout } from "@/lib/estimates/deposit-checkout";
import { resolvePortalSlug } from "@/lib/portal/company";
import { findEstimateByPublicToken } from "@/lib/portal/public-estimate";
import { applyPaidCheckoutSession } from "@/lib/stripe/confirm-checkout";
import { getStripeClient } from "@/lib/stripe/client";
import { getCustomerDefaultCardId } from "@/lib/customers/stripe";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const ctx = await requirePortalCustomer();

  let estimateId: string | null = null;
  let publicToken: string | null = null;
  let companyId: string | null = null;
  let slugSource: { portalSlug: string | null; bookingSlug: string | null } | null = null;

  if (ctx) {
    if (!portalFeatureEnabled(ctx.company, "estimates")) {
      return portalForbiddenResponse("Estimates are not available in the portal");
    }
    const estimate = await prisma.estimate.findFirst({
      where: {
        companyId: ctx.companyId,
        customerId: ctx.customerId,
        OR: [{ id }, { publicToken: id }],
        status: { in: ["SENT", "APPROVED"] },
        signedAt: { not: null },
      },
    });
    if (estimate) {
      estimateId = estimate.id;
      publicToken = estimate.publicToken;
      companyId = estimate.companyId;
      slugSource = ctx.company;
    }
  } else {
    const estimate = await findEstimateByPublicToken(id);
    if (
      estimate?.signedAt &&
      (estimate.status === "SENT" || estimate.status === "APPROVED")
    ) {
      estimateId = estimate.id;
      publicToken = estimate.publicToken;
      companyId = estimate.companyId;
      slugSource = estimate.company;
    }
  }

  if (!estimateId || !publicToken || !companyId || !slugSource) {
    return portalNotFoundResponse();
  }

  const approvalEstimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    select: {
      customerId: true,
      designExportMetadata: true,
      selectedOptionId: true,
      options: { select: { id: true, letter: true, sortOrder: true } },
    },
  });
  const metadata = approvalEstimate?.designExportMetadata;
  const metadataRecord =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : null;
  const selectedOption = approvalEstimate?.options.find(
    (option) => option.id === approvalEstimate.selectedOptionId
  );
  const metadataOptions = Array.isArray(metadataRecord?.options)
    ? metadataRecord.options.filter(
        (option): option is Record<string, unknown> =>
          Boolean(option) && typeof option === "object" && !Array.isArray(option)
      )
    : [];
  const selectedOptionMetadata = selectedOption
    ? metadataOptions.find((option) => option.letter === selectedOption.letter) ??
      metadataOptions[selectedOption.sortOrder]
    : null;
  const isPermanentLighting = selectedOptionMetadata?.pricingMode === "permanent";
  const requiresHolidayCard = Boolean(
    metadataRecord?.source === "holiday-lighting-quote" &&
      !isPermanentLighting &&
      (typeof selectedOptionMetadata?.recurringYearlyService === "boolean"
        ? selectedOptionMetadata.recurringYearlyService
        : metadataRecord.recurringYearlyService === true)
  );
  if (requiresHolidayCard && approvalEstimate) {
    const savedCard = await getCustomerDefaultCardId({
      customerId: approvalEstimate.customerId,
      companyId,
    });
    if (!savedCard) {
      return NextResponse.json(
        { error: "Save a card on file before approving a holiday lighting estimate" },
        { status: 400 }
      );
    }
  }

  const body = (await request.json().catch(() => ({}))) as { sessionId?: unknown };
  if (typeof body.sessionId === "string" && body.sessionId) {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Payment processing is not configured" }, { status: 503 });
    }
    const session = await getStripeClient().checkout.sessions.retrieve(body.sessionId);
    const invoiceId = typeof session.metadata?.invoiceId === "string"
      ? session.metadata.invoiceId
      : null;
    const invoice = invoiceId
      ? await prisma.invoice.findFirst({
          where: { id: invoiceId, estimateId, companyId },
          select: { id: true },
        })
      : null;
    if (!invoice || session.payment_status !== "paid") {
      return NextResponse.json({ error: "Payment could not be verified" }, { status: 400 });
    }
    const confirmed = await applyPaidCheckoutSession(session);
    if (!confirmed.confirmed) {
      return NextResponse.json({ error: "Payment could not be recorded" }, { status: 409 });
    }
    const approved = await prisma.estimate.findUnique({
      where: { id: estimateId },
      select: { status: true, needsScheduling: true, depositPaidAt: true },
    });
    return NextResponse.json({
      ready: approved?.status === "APPROVED",
      status: approved?.status,
      needsScheduling: approved?.needsScheduling ?? false,
      depositPaidAt: approved?.depositPaidAt?.toISOString() ?? null,
    });
  }

  const origin = request.nextUrl.origin;
  const slug = resolvePortalSlug(slugSource) ?? "portal";

  try {
    const checkout = await createEstimateDepositCheckout({
      estimateId,
      successUrl: `${origin}/portal/${slug}/estimates/${publicToken}?deposit=success&session_id={CHECKOUT_SESSION_ID}&continueAfterVsl=1`,
      cancelUrl: `${origin}/portal/${slug}/estimates/${publicToken}?deposit=cancelled&continueAfterVsl=1`,
    });
    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Deposit checkout failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
