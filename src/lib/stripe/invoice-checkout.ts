import { getStripeClient } from "@/lib/stripe/client";
import { prisma } from "@/lib/prisma";

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
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    // Card only — skips Stripe Link / wallet chooser so field checkout opens on the card form.
    payment_method_types: ["card"],
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
