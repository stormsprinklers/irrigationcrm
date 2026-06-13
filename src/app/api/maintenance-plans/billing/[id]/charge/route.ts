import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageEnrollments } from "@/lib/maintenance-plans/permissions";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe/client";
import { toNumber } from "@/lib/visits/totals";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageEnrollments(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const billingPeriod = await prisma.maintenancePlanBillingPeriod.findFirst({
      where: {
        id,
        enrollment: { companyId: user.companyId },
      },
      include: {
        enrollment: {
          include: { customer: true },
        },
      },
    });

    if (!billingPeriod) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (billingPeriod.status === "PAID") {
      return NextResponse.json({ error: "Billing period is already paid" }, { status: 400 });
    }

    const amount = toNumber(billingPeriod.amount);
    const enrollment = billingPeriod.enrollment;

    if (!process.env.STRIPE_SECRET_KEY) {
      await prisma.maintenancePlanBillingPeriod.update({
        where: { id },
        data: { status: "PAID", paidAt: new Date() },
      });
      return NextResponse.json({ ok: true, stub: true, amount });
    }

    const stripeCustomerId =
      enrollment.stripeCustomerId ?? enrollment.customer.stripeCustomerId ?? null;
    const paymentMethodId = enrollment.stripePaymentMethodId;

    if (!stripeCustomerId || !paymentMethodId) {
      return NextResponse.json(
        { error: "Enrollment is missing Stripe customer or payment method" },
        { status: 400 }
      );
    }

    const stripe = getStripeClient();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "usd",
      customer: stripeCustomerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      metadata: {
        billingPeriodId: billingPeriod.id,
        enrollmentId: enrollment.id,
        companyId: user.companyId,
      },
    });

    if (paymentIntent.status === "succeeded") {
      const { recordMaintenanceInvoicePayment } = await import("@/lib/maintenance-plans/discounts");
      await recordMaintenanceInvoicePayment({
        companyId: user.companyId,
        customerId: enrollment.customerId,
        enrollmentId: enrollment.id,
        billingPeriodId: billingPeriod.id,
        amount,
        stripePaymentIntentId: paymentIntent.id,
      });
      return NextResponse.json({ ok: true, paymentIntentId: paymentIntent.id, amount });
    }

    await prisma.maintenancePlanBillingPeriod.update({
      where: { id },
      data: {
        status: "FAILED",
        stripePaymentIntentId: paymentIntent.id,
      },
    });

    return NextResponse.json(
      { error: "Payment failed", paymentIntentId: paymentIntent.id },
      { status: 402 }
    );
  } catch {
    return unauthorizedResponse();
  }
}
