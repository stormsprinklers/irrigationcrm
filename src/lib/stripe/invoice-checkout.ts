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
  // Omit payment_method_types so Checkout uses Dashboard methods (card, Apple Pay, Klarna).
  // Do not use PaymentIntent-only `automatic_payment_methods`. Link is off so a logged-in
  // staff Stripe Link account cannot autofill the owner's personal card.
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: params.customerEmail ?? undefined,
    wallet_options: { link: { display: "never" } },
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

export async function createCombinedInvoiceCheckoutSession(params: {
  invoices: Array<{ id: string; invoiceNumber: string; balanceDue: number }>;
  companyId: string;
  customerId: string;
  customerEmail: string | null;
  successUrl: string;
  cancelUrl: string;
}) {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (params.invoices.length < 2) {
    throw new Error("At least two invoices are required");
  }

  const lineItems = params.invoices.map((invoice) => {
    const amountCents = Math.round(invoice.balanceDue * 100);
    if (amountCents <= 0) {
      throw new Error(`Invoice ${invoice.invoiceNumber} has no balance due`);
    }
    return {
      quantity: 1,
      price_data: {
        currency: "usd" as const,
        unit_amount: amountCents,
        product_data: {
          name: `Invoice ${invoice.invoiceNumber}`,
          description: "Customer portal payment",
        },
      },
    };
  });

  const invoiceIds = params.invoices.map((invoice) => invoice.id).join(",");
  const amountsCents = params.invoices
    .map((invoice) => String(Math.round(invoice.balanceDue * 100)))
    .join(",");
  const metadata = {
    checkoutType: "multi_invoice",
    invoiceIds,
    amountsCents,
    companyId: params.companyId,
    customerId: params.customerId,
  };

  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: params.customerEmail ?? undefined,
    wallet_options: { link: { display: "never" } },
    line_items: lineItems,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    payment_intent_data: { metadata },
    metadata,
  });

  await prisma.invoice.updateMany({
    where: { id: { in: params.invoices.map((invoice) => invoice.id) }, companyId: params.companyId },
    data: { stripeCheckoutSessionId: session.id },
  });

  if (!session.url) {
    throw new Error("Failed to create checkout session");
  }

  return session;
}

/**
 * Create a fresh Stripe Checkout Session for in-app card collection.
 * Do not put session.url in SMS, email, or QR — use getInvoicePayUrl() instead.
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
