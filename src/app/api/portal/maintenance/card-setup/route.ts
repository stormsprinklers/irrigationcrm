import { NextRequest, NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/app-url";
import {
  createCardSetupCheckoutSession,
  ensureStripeCustomer,
  getCustomerDefaultCardId,
} from "@/lib/customers/stripe";
import {
  requirePortalCustomer,
  portalUnauthorizedResponse,
  portalForbiddenResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import { resolvePortalSlug } from "@/lib/portal/company";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();
  if (!portalFeatureEnabled(ctx.company, "maintenance")) {
    return portalForbiddenResponse("Maintenance plans are not available in the portal");
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Payments are not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    enrollmentId?: string;
    returnPath?: string;
  };

  const customer = await prisma.customer.findFirst({
    where: { id: ctx.customerId, companyId: ctx.companyId },
    select: { id: true, name: true, email: true, stripeCustomerId: true },
  });
  if (!customer) return portalUnauthorizedResponse();

  if (body.enrollmentId) {
    const enrollment = await prisma.maintenancePlanEnrollment.findFirst({
      where: {
        id: body.enrollmentId,
        companyId: ctx.companyId,
        customerId: ctx.customerId,
      },
      select: { id: true },
    });
    if (!enrollment) {
      return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
    }
  }

  const existingCard = await getCustomerDefaultCardId({
    customerId: ctx.customerId,
    companyId: ctx.companyId,
  });
  if (existingCard) {
    return NextResponse.json({ ok: true, alreadyOnFile: true, paymentMethodId: existingCard });
  }

  const stripeCustomerId = await ensureStripeCustomer(customer, ctx.companyId);
  if (!stripeCustomerId) {
    return NextResponse.json({ error: "Failed to create Stripe customer" }, { status: 500 });
  }

  const slug = resolvePortalSlug(ctx.company);
  const appUrl = getAppBaseUrl(request.nextUrl.origin);
  const baseReturn =
    body.returnPath?.startsWith(`/portal/${slug}`)
      ? body.returnPath.split("?")[0]
      : `/portal/${slug}/maintenance`;
  const payQuery = body.enrollmentId ? `&pay=${encodeURIComponent(body.enrollmentId)}` : "";

  const session = await createCardSetupCheckoutSession({
    customerId: ctx.customerId,
    companyId: ctx.companyId,
    stripeCustomerId,
    appUrl,
    enrollmentId: body.enrollmentId ?? null,
    successUrl: `${appUrl}${baseReturn}?card=success${payQuery}`,
    cancelUrl: `${appUrl}${baseReturn}?card=cancelled`,
  });

  if (!session.url) {
    return NextResponse.json({ error: "Failed to start card setup" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, setupUrl: session.url });
}
