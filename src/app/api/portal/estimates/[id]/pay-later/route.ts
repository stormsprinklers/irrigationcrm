import { NextRequest, NextResponse } from "next/server";
import { computeDepositAmount } from "@/lib/estimates/booking";
import {
  getCustomerDefaultCardId,
  requireCardOnFileOrSetupUrl,
} from "@/lib/customers/stripe";
import { prisma } from "@/lib/prisma";
import { requirePortalCustomer, portalNotFoundResponse } from "@/lib/portal/auth";
import { findEstimateByPublicToken } from "@/lib/portal/public-estimate";
import { resolvePortalSlug } from "@/lib/portal/company";
import { getStripeClient } from "@/lib/stripe/client";

type Params = { params: Promise<{ id: string }> };

async function resolveApprovedEstimate(id: string) {
  const ctx = await requirePortalCustomer();
  if (ctx) {
    return prisma.estimate.findFirst({
      where: {
        companyId: ctx.companyId,
        customerId: ctx.customerId,
        OR: [{ id }, { publicToken: id }],
        status: "APPROVED",
      },
      include: { company: true },
    });
  }

  const estimate = await findEstimateByPublicToken(id);
  return estimate?.status === "APPROVED" ? estimate : null;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const estimate = await resolveApprovedEstimate(id);
    if (!estimate) return portalNotFoundResponse();

    const body = (await request.json().catch(() => ({}))) as { sessionId?: string };

    if (body.sessionId) {
      if (!process.env.STRIPE_SECRET_KEY) {
        return NextResponse.json({ error: "Payment setup is not configured" }, { status: 503 });
      }
      const session = await getStripeClient().checkout.sessions.retrieve(body.sessionId);
      const valid =
        session.mode === "setup" &&
        session.status === "complete" &&
        session.metadata?.purpose === "estimate_pay_later" &&
        session.metadata?.estimateId === estimate.id &&
        session.metadata?.companyId === estimate.companyId &&
        session.metadata?.customerId === estimate.customerId;
      if (!valid) {
        return NextResponse.json({ error: "Card setup could not be verified" }, { status: 400 });
      }
      await prisma.estimate.update({
        where: { id: estimate.id },
        data: { needsScheduling: true },
      });
      return NextResponse.json({ ready: true, cardOnFile: true });
    }

    if (computeDepositAmount(estimate) <= 0) {
      return NextResponse.json({ error: "No payment arrangement is required" }, { status: 400 });
    }

    const existingCard = await getCustomerDefaultCardId({
      customerId: estimate.customerId,
      companyId: estimate.companyId,
    });
    if (existingCard) {
      await prisma.estimate.update({
        where: { id: estimate.id },
        data: { needsScheduling: true },
      });
      return NextResponse.json({ ready: true, cardOnFile: true });
    }

    const slug = resolvePortalSlug(estimate.company) ?? "portal";
    const quoteUrl = `${request.nextUrl.origin}/portal/${encodeURIComponent(slug)}/estimates/${encodeURIComponent(estimate.publicToken)}`;
    const setup = await requireCardOnFileOrSetupUrl({
      customerId: estimate.customerId,
      companyId: estimate.companyId,
      appUrl: request.nextUrl.origin,
      successUrl: `${quoteUrl}?payment=card-saved&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${quoteUrl}?payment=card-cancelled`,
      estimateId: estimate.id,
      purpose: "estimate_pay_later",
    });

    if (setup.ok) {
      await prisma.estimate.update({
        where: { id: estimate.id },
        data: { needsScheduling: true },
      });
      return NextResponse.json({ ready: true, cardOnFile: true });
    }
    if (!setup.setupUrl) {
      return NextResponse.json({ error: "Card setup is unavailable" }, { status: 503 });
    }
    return NextResponse.json({ ready: false, setupUrl: setup.setupUrl });
  } catch (error) {
    console.error("Estimate pay-later setup failed", error);
    return NextResponse.json(
      { error: "Could not start card setup. Please try again." },
      { status: 500 }
    );
  }
}
