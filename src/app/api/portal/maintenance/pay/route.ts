import { NextRequest, NextResponse } from "next/server";
import type { BillingFrequency } from "@prisma/client";
import {
  getCustomerDefaultCardId,
  ensureStripeCustomer,
} from "@/lib/customers/stripe";
import {
  requirePortalCustomer,
  portalUnauthorizedResponse,
  portalForbiddenResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import { recordMaintenanceInvoicePayment } from "@/lib/maintenance-plans/discounts";
import { createEnrollmentSubscription, syncTemplateToStripe } from "@/lib/maintenance-plans/stripe-sync";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe/client";
import { toNumber } from "@/lib/visits/totals";

const PAYABLE_STATUSES = new Set(["DUE", "FAILED", "PENDING"]);

export async function POST(request: NextRequest) {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();
  if (!portalFeatureEnabled(ctx.company, "maintenance")) {
    return portalForbiddenResponse("Maintenance plans are not available in the portal");
  }

  const body = (await request.json().catch(() => ({}))) as {
    enrollmentId?: string;
    billingFrequency?: BillingFrequency;
    billingPeriodIds?: string[];
  };

  if (!body.enrollmentId) {
    return NextResponse.json({ error: "enrollmentId is required" }, { status: 400 });
  }

  const enrollment = await prisma.maintenancePlanEnrollment.findFirst({
    where: {
      id: body.enrollmentId,
      companyId: ctx.companyId,
      customerId: ctx.customerId,
    },
    include: {
      template: true,
      customer: { select: { id: true, name: true, email: true, stripeCustomerId: true } },
      billingPeriods: {
        where: { status: { in: ["DUE", "FAILED", "PENDING"] } },
        orderBy: { dueDate: "asc" },
      },
    },
  });

  if (!enrollment) {
    return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
  }

  const requestedFrequency = body.billingFrequency;
  if (
    requestedFrequency &&
    !enrollment.template.allowedBillingFrequencies.includes(requestedFrequency)
  ) {
    return NextResponse.json(
      { error: "Selected billing frequency is not available for this plan" },
      { status: 400 }
    );
  }

  const periodIds = new Set(body.billingPeriodIds ?? enrollment.billingPeriods.map((p) => p.id));
  const periodsToPay = enrollment.billingPeriods.filter(
    (p) => periodIds.has(p.id) && PAYABLE_STATUSES.has(p.status) && toNumber(p.amount) > 0
  );

  if (periodsToPay.length === 0) {
    return NextResponse.json({ error: "No unpaid billing periods to pay" }, { status: 400 });
  }

  const paymentMethodId =
    (await getCustomerDefaultCardId({
      customerId: ctx.customerId,
      companyId: ctx.companyId,
    })) ?? enrollment.stripePaymentMethodId;

  if (!paymentMethodId) {
    return NextResponse.json(
      { error: "Add a card on file before paying", code: "CARD_REQUIRED" },
      { status: 400 }
    );
  }

  const stripeCustomerId =
    (await ensureStripeCustomer(enrollment.customer, ctx.companyId)) ??
    enrollment.stripeCustomerId ??
    enrollment.customer.stripeCustomerId;

  if (!stripeCustomerId) {
    return NextResponse.json({ error: "Unable to prepare payment customer" }, { status: 500 });
  }

  // Persist preferred billing frequency + card for future charges.
  const nextFrequency = requestedFrequency ?? enrollment.billingFrequency;
  await prisma.maintenancePlanEnrollment.update({
    where: { id: enrollment.id },
    data: {
      billingFrequency: nextFrequency,
      stripeCustomerId,
      stripePaymentMethodId: paymentMethodId,
    },
  });

  if (!process.env.STRIPE_SECRET_KEY) {
    for (const period of periodsToPay) {
      await recordMaintenanceInvoicePayment({
        companyId: ctx.companyId,
        customerId: ctx.customerId,
        enrollmentId: enrollment.id,
        billingPeriodId: period.id,
        amount: toNumber(period.amount),
      });
    }
    return NextResponse.json({
      ok: true,
      stub: true,
      paidCount: periodsToPay.length,
      amount: periodsToPay.reduce((s, p) => s + toNumber(p.amount), 0),
    });
  }

  const stripe = getStripeClient();
  try {
    await stripe.paymentMethods.attach(paymentMethodId, { customer: stripeCustomerId });
  } catch {
    // Already attached is fine.
  }
  await stripe.customers.update(stripeCustomerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  let paidAmount = 0;
  const paidIds: string[] = [];

  for (const period of periodsToPay) {
    const amount = toNumber(period.amount);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "usd",
      customer: stripeCustomerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      metadata: {
        billingPeriodId: period.id,
        enrollmentId: enrollment.id,
        companyId: ctx.companyId,
        source: "portal_maintenance_pay",
      },
    });

    if (paymentIntent.status !== "succeeded") {
      await prisma.maintenancePlanBillingPeriod.update({
        where: { id: period.id },
        data: {
          status: "FAILED",
          stripePaymentIntentId: paymentIntent.id,
        },
      });
      return NextResponse.json(
        {
          error: "Payment failed. Please try another card or contact us.",
          paidCount: paidIds.length,
          paidAmount,
          failedPeriodId: period.id,
        },
        { status: 402 }
      );
    }

    await recordMaintenanceInvoicePayment({
      companyId: ctx.companyId,
      customerId: ctx.customerId,
      enrollmentId: enrollment.id,
      billingPeriodId: period.id,
      amount,
      stripePaymentIntentId: paymentIntent.id,
    });
    paidAmount += amount;
    paidIds.push(period.id);
  }

  // Best-effort: align Stripe subscription with chosen frequency.
  if (nextFrequency !== "MULTI_YEAR_UPFRONT") {
    try {
      const synced = await syncTemplateToStripe(enrollment.templateId);
      const priceId = synced?.priceIds?.[nextFrequency];
      if (priceId) {
        if (enrollment.stripeSubscriptionId) {
          const sub = await stripe.subscriptions.retrieve(enrollment.stripeSubscriptionId);
          const itemId = sub.items.data[0]?.id;
          if (itemId) {
            await stripe.subscriptions.update(enrollment.stripeSubscriptionId, {
              items: [{ id: itemId, price: priceId }],
              proration_behavior: "none",
              default_payment_method: paymentMethodId,
            });
          }
        } else {
          const subscription = await createEnrollmentSubscription({
            enrollmentId: enrollment.id,
            stripeCustomerId,
            priceId,
            paymentMethodId,
          });
          await prisma.maintenancePlanEnrollment.update({
            where: { id: enrollment.id },
            data: { stripeSubscriptionId: subscription.id },
          });
        }
      }
    } catch (err) {
      console.error("[portal] subscription sync after pay failed", err);
    }
  }

  return NextResponse.json({
    ok: true,
    paidCount: paidIds.length,
    amount: paidAmount,
    billingFrequency: nextFrequency,
  });
}
