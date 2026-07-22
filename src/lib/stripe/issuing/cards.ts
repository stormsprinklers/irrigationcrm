import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe/client";
import type { ExpenseCardControls } from "@/lib/expense-cards/controls";

/** Categories Stripe uses for ATM / cash access. */
const ATM_CASH_CATEGORIES = ["cash", "automated_cash_disburse"] as const;

/**
 * Map CRM controls → Stripe `spending_controls`.
 * Stripe forbids pairing allowed_* with blocked_* for the same dimension
 * (categories / countries / card_presences).
 */
export function buildSpendingControls(
  controls: ExpenseCardControls
): Stripe.Issuing.CardCreateParams.SpendingControls {
  const spendingLimits: Stripe.Issuing.CardCreateParams.SpendingControls.SpendingLimit[] = [
    { amount: controls.dailyLimitCents, interval: "daily" },
    { amount: controls.monthlyLimitCents, interval: "monthly" },
  ];

  const result: Stripe.Issuing.CardCreateParams.SpendingControls = {
    spending_limits: spendingLimits,
  };

  // Prefer allowlist when present (ATM/cash already excluded unless listed).
  // Only use blocked_categories when there is no allowlist.
  if (controls.allowedCategories.length) {
    const allowed = controls.blockAtm
      ? controls.allowedCategories.filter(
          (c) => !ATM_CASH_CATEGORIES.includes(c as (typeof ATM_CASH_CATEGORIES)[number])
        )
      : controls.allowedCategories;
    result.allowed_categories =
      allowed as Stripe.Issuing.CardCreateParams.SpendingControls.AllowedCategory[];
  } else if (controls.blockAtm) {
    result.blocked_categories =
      ATM_CASH_CATEGORIES as unknown as Stripe.Issuing.CardCreateParams.SpendingControls.BlockedCategory[];
  }

  if (controls.blockInternational) {
    result.allowed_merchant_countries = ["US"];
  }

  // CNP / ecommerce: Stripe-native control (runs before real-time auth webhook).
  if (controls.blockOnline) {
    result.blocked_card_presences = ["not_present"];
  }

  return result;
}

export async function createIssuingCardholder(params: {
  userId: string;
  companyId: string;
  name: string;
  email: string;
  phone: string | null;
  billing: {
    line1: string;
    city: string;
    state: string;
    postal_code: string;
    country?: string;
  };
}) {
  const stripe = getStripeClient();
  return stripe.issuing.cardholders.create({
    type: "individual",
    name: params.name,
    email: params.email,
    phone_number: params.phone ?? undefined,
    status: "active",
    billing: {
      address: {
        line1: params.billing.line1,
        city: params.billing.city,
        state: params.billing.state,
        postal_code: params.billing.postal_code,
        country: params.billing.country ?? "US",
      },
    },
    metadata: {
      companyId: params.companyId,
      userId: params.userId,
    },
  });
}

export async function createVirtualIssuingCard(params: {
  cardholderId: string;
  companyId: string;
  userId: string;
  controls: ExpenseCardControls;
  encryptedPin?: string | null;
}) {
  const stripe = getStripeClient();
  return stripe.issuing.cards.create({
    cardholder: params.cardholderId,
    currency: "usd",
    type: "virtual",
    status: "active",
    spending_controls: buildSpendingControls(params.controls),
    metadata: {
      companyId: params.companyId,
      userId: params.userId,
    },
    ...(params.encryptedPin
      ? { pin: { encrypted_number: params.encryptedPin } }
      : {}),
  });
}

export async function updateIssuingCardControls(params: {
  stripeCardId: string;
  controls: ExpenseCardControls;
  status?: "active" | "inactive" | "canceled";
}) {
  const stripe = getStripeClient();
  return stripe.issuing.cards.update(params.stripeCardId, {
    spending_controls: buildSpendingControls(params.controls),
    ...(params.status ? { status: params.status } : {}),
  });
}

export async function getIssuingCard(stripeCardId: string) {
  const stripe = getStripeClient();
  return stripe.issuing.cards.retrieve(stripeCardId);
}

export async function listIssuingAuthorizations(params: {
  stripeCardId?: string;
  limit?: number;
}) {
  const stripe = getStripeClient();
  return stripe.issuing.authorizations.list({
    ...(params.stripeCardId ? { card: params.stripeCardId } : {}),
    limit: params.limit ?? 25,
  });
}

export async function listIssuingTransactions(params: {
  stripeCardId?: string;
  limit?: number;
}) {
  const stripe = getStripeClient();
  return stripe.issuing.transactions.list({
    ...(params.stripeCardId ? { card: params.stripeCardId } : {}),
    limit: params.limit ?? 25,
  });
}

/** Ephemeral key for Issuing Elements — never logs card secrets. */
export async function createIssuingEphemeralKey(params: {
  issuingCardId: string;
  stripeVersion: string;
}) {
  const stripe = getStripeClient();
  return stripe.ephemeralKeys.create(
    { issuing_card: params.issuingCardId },
    { apiVersion: params.stripeVersion as never }
  );
}
