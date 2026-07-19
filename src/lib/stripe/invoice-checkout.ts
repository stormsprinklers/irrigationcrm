import { getAppBaseUrl } from "@/lib/app-url";
import { getStripeClient } from "@/lib/stripe/client";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";

type CheckoutInvoice = {
  id: string;
  invoiceNumber: string;
  companyId: string;
  visitId: string | null;
};

export async function createInvoiceCheckoutSession(params: {
  invoice: CheckoutInvoice;
  customerEmail: string | null;
  productName: string;
  amount: number;
  successUrl: string;
  cancelUrl: string;
}) {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  const amountCents = Math.round(params.amount * 100);
  if (amountCents <= 0) {
    throw new Error("Amount must be greater than zero");
  }

  const stripe = getStripeClient();
  // automatic_payment_methods enables Apple Pay, Klarna, Link, etc. per Stripe Dashboard settings.
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    automatic_payment_methods: { enabled: true },
    customer_email: params.customerEmail ?? undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: {
            name: params.productName,
            description: `Invoice ${params.invoice.invoiceNumber}`,
          },
        },
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    payment_intent_data: {
      metadata: {
        invoiceId: params.invoice.id,
        ...(params.invoice.visitId ? { visitId: params.invoice.visitId } : {}),
        companyId: params.invoice.companyId,
      },
    },
    metadata: {
      invoiceId: params.invoice.id,
      ...(params.invoice.visitId ? { visitId: params.invoice.visitId } : {}),
      companyId: params.invoice.companyId,
    },
  });

  await prisma.invoice.update({
    where: { id: params.invoice.id },
    data: { stripeCheckoutSessionId: session.id },
  });

  if (!session.url) {
    throw new Error("Failed to create checkout session");
  }

  return session;
}

/**
 * Create a fresh Stripe Checkout Session for an invoice and return session.url.
 * Once a Stripe custom domain finishes provisioning, session.url is automatically branded.
 */
export async function createStripeCheckoutPayUrl(params: {
  invoiceId: string;
  companyId: string;
  mobileReturn?: boolean;
}): Promise<{ url: string; sessionId: string; amount: number } | null> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: params.invoiceId, companyId: params.companyId },
    include: {
      customer: true,
      visit: { select: { id: true, title: true } },
      payments: true,
    },
  });
  if (!invoice?.customer) return null;

  const paid = invoice.payments.reduce((sum, payment) => {
    if (payment.refundedAt) return sum;
    return sum + toNumber(payment.amount);
  }, 0);
  const balanceDue = Math.max(0, toNumber(invoice.total) - paid);
  if (balanceDue <= 0) return null;

  const appUrl = getAppBaseUrl();
  const visitId = invoice.visitId;
  const successUrl =
    params.mobileReturn && visitId
      ? `stormcrm://payment-return?visitId=${visitId}&session_id={CHECKOUT_SESSION_ID}`
      : visitId
        ? `${appUrl}/visits/${visitId}?payment=success&session_id={CHECKOUT_SESSION_ID}`
        : `${appUrl}/customers/invoices?invoiceId=${invoice.id}&payment=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl =
    params.mobileReturn && visitId
      ? `stormcrm://payment-return?visitId=${visitId}&payment=cancelled`
      : visitId
        ? `${appUrl}/visits/${visitId}?payment=cancelled`
        : `${appUrl}/customers/invoices?invoiceId=${invoice.id}&payment=cancelled`;

  const session = await createInvoiceCheckoutSession({
    invoice: {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      companyId: invoice.companyId,
      visitId: invoice.visitId,
    },
    customerEmail: invoice.customer.email,
    productName: invoice.visit?.title ?? `Invoice ${invoice.invoiceNumber}`,
    amount: balanceDue,
    successUrl,
    cancelUrl,
  });

  return { url: session.url!, sessionId: session.id, amount: balanceDue };
}
