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
      successUrl: `${origin}/portal/${slug}/estimates/${publicToken}?deposit=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/portal/${slug}/estimates/${publicToken}?deposit=cancelled`,
    });
    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Deposit checkout failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
