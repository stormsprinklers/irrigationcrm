import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe/client";
import type { BillingFrequency } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";

const FREQUENCY_LABELS: Record<BillingFrequency, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  ANNUAL: "Annual",
  MULTI_YEAR_UPFRONT: "Multi-year upfront",
};

export async function syncTemplateToStripe(templateId: string) {
  if (!process.env.STRIPE_SECRET_KEY) return null;

  const template = await prisma.maintenancePlanTemplate.findUnique({
    where: { id: templateId },
  });
  if (!template) return null;

  const stripe = getStripeClient();
  let productId = template.stripeProductId;

  if (!productId) {
    const product = await stripe.products.create({
      name: template.name,
      description: template.description ?? undefined,
      metadata: { templateId: template.id, companyId: template.companyId },
    });
    productId = product.id;
  }

  const priceIds: Record<string, string> =
    (template.stripePriceIds as Record<string, string> | null) ?? {};

  for (const frequency of template.allowedBillingFrequencies) {
    if (priceIds[frequency]) continue;

    const unitAmount = Math.round(toNumber(template.basePrice) * 100);
    let recurring: Stripe.PriceCreateParams.Recurring | undefined;

    if (frequency === "MONTHLY") recurring = { interval: "month" };
    else if (frequency === "QUARTERLY") recurring = { interval: "month", interval_count: 3 };
    else if (frequency === "ANNUAL") recurring = { interval: "year" };
    else if (frequency === "MULTI_YEAR_UPFRONT") {
      // One-time multi-year handled at enrollment checkout; skip subscription price
      continue;
    }

    const price = await stripe.prices.create({
      product: productId,
      unit_amount: unitAmount,
      currency: "usd",
      recurring,
      nickname: `${template.name} — ${FREQUENCY_LABELS[frequency]}`,
      metadata: { templateId: template.id, frequency },
    });
    priceIds[frequency] = price.id;
  }

  await prisma.maintenancePlanTemplate.update({
    where: { id: templateId },
    data: { stripeProductId: productId, stripePriceIds: priceIds },
  });

  return { productId, priceIds };
}

export async function createEnrollmentSubscription(params: {
  enrollmentId: string;
  stripeCustomerId: string;
  priceId: string;
  paymentMethodId?: string;
}) {
  const stripe = getStripeClient();

  if (params.paymentMethodId) {
    await stripe.paymentMethods.attach(params.paymentMethodId, {
      customer: params.stripeCustomerId,
    });
    await stripe.customers.update(params.stripeCustomerId, {
      invoice_settings: { default_payment_method: params.paymentMethodId },
    });
  }

  const subscription = await stripe.subscriptions.create({
    customer: params.stripeCustomerId,
    items: [{ price: params.priceId }],
    metadata: { enrollmentId: params.enrollmentId },
    payment_behavior: "default_incomplete",
    expand: ["latest_invoice.payment_intent"],
  });

  return subscription;
}
