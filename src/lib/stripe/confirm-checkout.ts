import type Stripe from "stripe";
import {
  allocateCombinedPayment,
  parseCombinedInvoiceMetadata,
} from "@/lib/invoices/combined-payment";
import { recordInvoicePayment } from "@/lib/invoices/record-payment";
import { getStripeClient } from "@/lib/stripe/client";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";

function getPaymentIntentId(session: Stripe.Checkout.Session): string | null {
  if (typeof session.payment_intent === "string") return session.payment_intent;
  return session.payment_intent?.id ?? null;
}

function computeBalanceDue(invoice: {
  total: unknown;
  payments: Array<{ amount: unknown; refundedAt: Date | null }>;
}) {
  const paid = invoice.payments.reduce((sum, payment) => {
    if (payment.refundedAt) return sum;
    return sum + toNumber(payment.amount);
  }, 0);
  return Math.max(0, toNumber(invoice.total) - paid);
}

export async function applyCombinedInvoicePayment(params: {
  companyId?: string | null;
  planned: Array<{ id: string; amount: number }>;
  amountPaid: number;
  paymentIntentId: string | null;
  sessionId?: string | null;
}) {
  const ids = params.planned.map((item) => item.id);
  const invoices = await prisma.invoice.findMany({
    where: {
      id: { in: ids },
      ...(params.companyId ? { companyId: params.companyId } : {}),
      maintenanceBillingPeriods: { none: {} },
    },
    include: { payments: true },
  });

  const due = invoices
    .filter((invoice) => invoice.status !== "VOID" && invoice.status !== "REFUNDED")
    .map((invoice) => ({
      id: invoice.id,
      balanceDue: computeBalanceDue(invoice),
    }))
    .filter((invoice) => invoice.balanceDue > 0);

  const allocations = allocateCombinedPayment(due, params.amountPaid, params.planned);
  const results = [];
  for (const allocation of allocations) {
    const result = await recordInvoicePayment({
      invoiceId: allocation.invoiceId,
      amount: allocation.amount,
      stripePaymentIntentId: params.paymentIntentId,
      stripeCheckoutSessionId: params.sessionId ?? null,
      clientIdempotencyKey: params.sessionId
        ? `checkout:${params.sessionId}:${allocation.invoiceId}`
        : params.paymentIntentId
          ? `pi:${params.paymentIntentId}:${allocation.invoiceId}`
          : null,
    });
    results.push(result);
  }

  return {
    confirmed: results.some((result) => Boolean(result?.recorded || result?.alreadyRecorded)),
    alreadyRecorded: results.length > 0 && results.every((result) => result?.alreadyRecorded),
    invoiceIds: allocations.map((allocation) => allocation.invoiceId),
  };
}

export async function applyPaidCheckoutSession(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") {
    return { confirmed: false as const, reason: "payment_pending" as const };
  }

  const paymentIntentId = getPaymentIntentId(session);
  const amountPaid =
    session.amount_total != null ? session.amount_total / 100 : 0;
  const combined = parseCombinedInvoiceMetadata(session.metadata);

  if (combined) {
    const applied = await applyCombinedInvoicePayment({
      companyId: combined.companyId,
      planned: combined.planned,
      amountPaid,
      paymentIntentId,
      sessionId: session.id,
    });
    if (!applied.confirmed) {
      return { confirmed: false as const, reason: "record_failed" as const };
    }
    return {
      confirmed: true as const,
      alreadyRecorded: applied.alreadyRecorded,
      invoiceIds: applied.invoiceIds,
      invoiceId: applied.invoiceIds[0] ?? null,
    };
  }

  const invoiceId = session.metadata?.invoiceId;
  if (!invoiceId) {
    return { confirmed: false as const, reason: "missing_invoice" as const };
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true },
  });

  if (!invoice) {
    return { confirmed: false as const, reason: "invoice_not_found" as const };
  }

  const amount = amountPaid > 0 ? amountPaid : toNumber(invoice.total);
  const result = await recordInvoicePayment({
    invoiceId,
    amount,
    stripePaymentIntentId: paymentIntentId,
    stripeCheckoutSessionId: session.id,
  });

  if (!result) {
    return { confirmed: false as const, reason: "record_failed" as const };
  }

  return {
    confirmed: true as const,
    alreadyRecorded: result.alreadyRecorded,
    invoiceStatus: result.invoiceStatus,
    invoiceId: result.invoiceId,
  };
}

export async function confirmCheckoutSession(sessionId: string) {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return applyPaidCheckoutSession(session);
}
