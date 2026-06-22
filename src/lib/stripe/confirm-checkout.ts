import type Stripe from "stripe";
import { recordInvoicePayment } from "@/lib/invoices/record-payment";
import { getStripeClient } from "@/lib/stripe/client";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";

function getPaymentIntentId(session: Stripe.Checkout.Session): string | null {
  if (typeof session.payment_intent === "string") return session.payment_intent;
  return session.payment_intent?.id ?? null;
}

export async function confirmCheckoutSession(sessionId: string) {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status !== "paid") {
    return { confirmed: false as const, reason: "payment_pending" as const };
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

  const paymentIntentId = getPaymentIntentId(session);
  const amount =
    session.amount_total != null ? session.amount_total / 100 : toNumber(invoice.total);

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
