import type Stripe from "stripe";
import { recordInvoicePayment } from "@/lib/invoices/record-payment";
import { recordMaintenanceInvoicePayment } from "@/lib/maintenance-plans/discounts";
import { confirmCheckoutSession } from "@/lib/stripe/confirm-checkout";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";

type InvoiceWithSubscription = Stripe.Invoice & {
  subscription?: string | Stripe.Subscription | null;
  payment_intent?: string | Stripe.PaymentIntent | null;
  parent?: {
    subscription_details?: {
      subscription?: string | Stripe.Subscription | null;
    };
  };
};

function getSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const inv = invoice as InvoiceWithSubscription;
  if (typeof inv.subscription === "string") return inv.subscription;
  if (inv.subscription && typeof inv.subscription === "object") return inv.subscription.id;
  const parentSub = inv.parent?.subscription_details?.subscription;
  if (typeof parentSub === "string") return parentSub;
  if (parentSub && typeof parentSub === "object") return parentSub.id;
  return null;
}

function getPaymentIntentIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const inv = invoice as InvoiceWithSubscription;
  if (typeof inv.payment_intent === "string") return inv.payment_intent;
  if (inv.payment_intent && typeof inv.payment_intent === "object") return inv.payment_intent.id;
  return null;
}

function getPaymentIntentId(session: Stripe.Checkout.Session): string | null {
  if (typeof session.payment_intent === "string") return session.payment_intent;
  return session.payment_intent?.id ?? null;
}

export async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return;

  const invoiceId = session.metadata?.invoiceId;
  if (!invoiceId) return;

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { total: true },
  });
  if (!invoice) return;

  const amount = session.amount_total != null ? session.amount_total / 100 : toNumber(invoice.total);

  await recordInvoicePayment({
    invoiceId,
    amount,
    stripePaymentIntentId: getPaymentIntentId(session),
    stripeCheckoutSessionId: session.id,
  });
}

export async function handleCheckoutSessionAsyncPaymentSucceeded(session: Stripe.Checkout.Session) {
  await handleCheckoutSessionCompleted(session);
}

export async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const invoiceId = paymentIntent.metadata?.invoiceId;
  if (!invoiceId) return;

  const amount = (paymentIntent.amount_received ?? paymentIntent.amount ?? 0) / 100;
  if (amount <= 0) return;

  await recordInvoicePayment({
    invoiceId,
    amount,
    stripePaymentIntentId: paymentIntent.id,
  });
}

export async function handlePaymentIntentPaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  const invoiceId = paymentIntent.metadata?.invoiceId;
  if (!invoiceId) return;

  const amount = (paymentIntent.amount ?? 0) / 100;
  const { handleInvoicePaymentFailure } = await import("@/lib/notifications/payment-events");
  await handleInvoicePaymentFailure({
    invoiceId,
    amount: amount > 0 ? amount : null,
    stripePaymentIntentId: paymentIntent.id,
  });
}

export async function handleCheckoutSessionAsyncPaymentFailed(session: Stripe.Checkout.Session) {
  const invoiceId = session.metadata?.invoiceId;
  if (!invoiceId) return;

  const amount = session.amount_total != null ? session.amount_total / 100 : null;
  const { handleInvoicePaymentFailure } = await import("@/lib/notifications/payment-events");
  await handleInvoicePaymentFailure({
    invoiceId,
    amount,
    stripePaymentIntentId: getPaymentIntentId(session),
  });
}

export async function handleCheckoutSessionById(sessionId: string) {
  return confirmCheckoutSession(sessionId);
}

export async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionId = getSubscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return;

  const enrollment = await prisma.maintenancePlanEnrollment.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
  });
  if (!enrollment) return;

  const paymentIntentId = getPaymentIntentIdFromInvoice(invoice);

  const amount = (invoice.amount_paid ?? 0) / 100;
  if (amount <= 0) return;

  const period = await prisma.maintenancePlanBillingPeriod.findFirst({
    where: {
      enrollmentId: enrollment.id,
      status: { in: ["DUE", "FAILED", "PENDING"] },
    },
    orderBy: { dueDate: "asc" },
  });

  if (period) {
    const existing = paymentIntentId
      ? await prisma.maintenancePlanBillingPeriod.findFirst({
          where: { stripePaymentIntentId: paymentIntentId },
        })
      : null;
    if (existing) return;

    await recordMaintenanceInvoicePayment({
      companyId: enrollment.companyId,
      customerId: enrollment.customerId,
      enrollmentId: enrollment.id,
      billingPeriodId: period.id,
      amount,
      stripePaymentIntentId: paymentIntentId,
    });
  }

  await prisma.maintenancePlanEnrollment.update({
    where: { id: enrollment.id },
    data: {
      nextBillingDate: invoice.lines?.data[0]?.period?.end
        ? new Date(invoice.lines.data[0].period.end * 1000)
        : undefined,
    },
  });
}

export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = getSubscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return;

  const enrollment = await prisma.maintenancePlanEnrollment.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
  });
  if (!enrollment) return;

  await prisma.maintenancePlanBillingPeriod.updateMany({
    where: {
      enrollmentId: enrollment.id,
      status: { in: ["DUE", "PENDING"] },
    },
    data: { status: "FAILED" },
  });
}

export async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const periodEnd = subscription.items?.data[0]?.current_period_end;
  await prisma.maintenancePlanEnrollment.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      nextBillingDate: periodEnd ? new Date(periodEnd * 1000) : undefined,
    },
  });
}

export async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  await prisma.maintenancePlanEnrollment.updateMany({
    where: { stripeSubscriptionId: subscription.id, status: { not: "CANCELLED" } },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancellationReason: "Stripe subscription cancelled",
    },
  });
}
