import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe/client";

export async function ensureStripeCustomer(
  customer: { id: string; name: string; email: string | null; stripeCustomerId: string | null },
  companyId: string
) {
  if (customer.stripeCustomerId) return customer.stripeCustomerId;

  if (!process.env.STRIPE_SECRET_KEY) return null;

  const stripe = getStripeClient();
  const stripeCustomer = await stripe.customers.create({
    name: customer.name,
    email: customer.email ?? undefined,
    metadata: { customerId: customer.id, companyId },
  });

  await prisma.customer.update({
    where: { id: customer.id },
    data: { stripeCustomerId: stripeCustomer.id },
  });

  return stripeCustomer.id;
}

export type CardOnFile = {
  id: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
};

/** Returns saved cards for a CRM customer (empty if none / Stripe not configured). */
export async function listCustomerCardsOnFile(params: {
  customerId: string;
  companyId: string;
}): Promise<{ stripeCustomerId: string | null; cards: CardOnFile[] }> {
  const customer = await prisma.customer.findFirst({
    where: { id: params.customerId, companyId: params.companyId },
    select: { id: true, name: true, email: true, stripeCustomerId: true },
  });
  if (!customer) return { stripeCustomerId: null, cards: [] };
  if (!process.env.STRIPE_SECRET_KEY || !customer.stripeCustomerId) {
    return { stripeCustomerId: customer.stripeCustomerId, cards: [] };
  }

  const stripe = getStripeClient();
  const methods = await stripe.paymentMethods.list({
    customer: customer.stripeCustomerId,
    type: "card",
  });

  return {
    stripeCustomerId: customer.stripeCustomerId,
    cards: methods.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand ?? null,
      last4: pm.card?.last4 ?? null,
      expMonth: pm.card?.exp_month ?? null,
      expYear: pm.card?.exp_year ?? null,
    })),
  };
}

export async function getCustomerDefaultCardId(params: {
  customerId: string;
  companyId: string;
}): Promise<string | null> {
  const { cards } = await listCustomerCardsOnFile(params);
  return cards[0]?.id ?? null;
}

export async function createCardSetupCheckoutSession(params: {
  customerId: string;
  companyId: string;
  stripeCustomerId: string;
  appUrl: string;
  /** Prefer deep-link return for iOS Safari flows. */
  mobileReturn?: boolean;
  /** Optional return after save (web). Defaults to customer profile card-setup success page. */
  successUrl?: string;
  cancelUrl?: string;
  enrollmentId?: string | null;
}) {
  const stripe = getStripeClient();
  const company = await prisma.company.findUnique({
    where: { id: params.companyId },
    select: { name: true },
  });

  const successUrl =
    params.successUrl ??
    (params.mobileReturn
      ? `stormcrm://card-setup-return?customerId=${params.customerId}&status=success`
      : `${params.appUrl}/pay/card/success?customer=${params.customerId}`);
  const cancelUrl =
    params.cancelUrl ??
    (params.mobileReturn
      ? `stormcrm://card-setup-return?customerId=${params.customerId}&status=cancelled`
      : `${params.appUrl}/pay/card/cancelled?customer=${params.customerId}`);

  return stripe.checkout.sessions.create({
    mode: "setup",
    customer: params.stripeCustomerId,
    payment_method_types: ["card"],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      customerId: params.customerId,
      companyId: params.companyId,
      purpose: "card_on_file",
      ...(params.enrollmentId ? { enrollmentId: params.enrollmentId } : {}),
    },
    custom_text: {
      submit: {
        message: `Save your card with ${company?.name ?? "us"} for maintenance plan billing and faster checkout.`,
      },
    },
  });
}

/**
 * Ensures the customer has a card on file. If not, creates a Stripe Setup Checkout session.
 * Used by maintenance plan enrollment / activation.
 */
export async function requireCardOnFileOrSetupUrl(params: {
  customerId: string;
  companyId: string;
  appUrl: string;
  mobileReturn?: boolean;
  enrollmentId?: string | null;
  successUrl?: string;
  cancelUrl?: string;
}): Promise<
  | { ok: true; paymentMethodId: string; stripeCustomerId: string }
  | { ok: false; code: "CARD_REQUIRED"; setupUrl: string; error: string }
> {
  if (!process.env.STRIPE_SECRET_KEY) {
    return {
      ok: false,
      code: "CARD_REQUIRED",
      setupUrl: "",
      error: "Stripe is not configured — cannot verify card on file",
    };
  }

  const customer = await prisma.customer.findFirst({
    where: { id: params.customerId, companyId: params.companyId },
    select: { id: true, name: true, email: true, stripeCustomerId: true },
  });
  if (!customer) {
    return {
      ok: false,
      code: "CARD_REQUIRED",
      setupUrl: "",
      error: "Customer not found",
    };
  }

  const stripeCustomerId = await ensureStripeCustomer(customer, params.companyId);
  if (!stripeCustomerId) {
    return {
      ok: false,
      code: "CARD_REQUIRED",
      setupUrl: "",
      error: "Failed to create Stripe customer",
    };
  }

  const paymentMethodId = await getCustomerDefaultCardId({
    customerId: params.customerId,
    companyId: params.companyId,
  });
  if (paymentMethodId) {
    return { ok: true, paymentMethodId, stripeCustomerId };
  }

  const session = await createCardSetupCheckoutSession({
    customerId: params.customerId,
    companyId: params.companyId,
    stripeCustomerId,
    appUrl: params.appUrl,
    mobileReturn: params.mobileReturn,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
    enrollmentId: params.enrollmentId,
  });

  if (!session.url) {
    return {
      ok: false,
      code: "CARD_REQUIRED",
      setupUrl: "",
      error: "Failed to create card setup checkout",
    };
  }

  return {
    ok: false,
    code: "CARD_REQUIRED",
    setupUrl: session.url,
    error: "A card on file is required to enroll in a maintenance plan. Add a card to continue.",
  };
}

export function canManageCustomerPayments(role: UserRole) {
  return role === "CSR" || role === "SALES" || role === "MANAGER" || role === "ADMIN";
}
