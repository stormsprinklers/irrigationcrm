import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe/client";

export type FundingBalances = {
  currency: string;
  paymentsAvailableCents: number;
  issuingAvailableCents: number;
  pendingAchTopUpCents: number;
};

function sumUsd(rows: Array<{ amount: number; currency: string }> | undefined) {
  if (!rows?.length) return 0;
  return rows.filter((r) => r.currency === "usd").reduce((sum, r) => sum + r.amount, 0);
}

/** Snapshot of Payments + Issuing balances (platform Stripe account). */
export async function getIssuingFundingBalances(): Promise<FundingBalances> {
  const stripe = getStripeClient();
  const [balance, pendingTopUps] = await Promise.all([
    stripe.balance.retrieve(),
    // Fetch enough pending top-ups that hourly cron cannot miss an in-flight ACH.
    stripe.topups.list({ status: "pending", limit: 100 }),
  ]);

  const pendingAchTopUpCents = pendingTopUps.data
    .filter((t) => t.currency === "usd")
    .filter((t) => {
      const dest = (t as Stripe.Topup & { destination_balance?: string }).destination_balance;
      // Prefer Issuing-destined top-ups; if field absent, count all pending (US Issuing default).
      return !dest || dest === "issuing";
    })
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    currency: "usd",
    paymentsAvailableCents: sumUsd(balance.available),
    issuingAvailableCents: sumUsd(balance.issuing?.available),
    pendingAchTopUpCents,
  };
}

export async function getTopUpStatus(topUpId: string) {
  const stripe = getStripeClient();
  try {
    return await stripe.topups.retrieve(topUpId);
  } catch {
    return null;
  }
}

/**
 * Move funds from Stripe Payments balance → Issuing (preview Balance Transfers API).
 * Instant in the US when available for the account.
 */
export async function transferPaymentsToIssuing(params: {
  amountCents: number;
  description?: string;
  idempotencyKey?: string;
}) {
  if (params.amountCents < 1) {
    throw new Error("Transfer amount must be at least 1 cent");
  }
  const stripe = getStripeClient();
  const result = await stripe.rawRequest(
    "POST",
    "/v1/balance_transfers",
    {
      amount: params.amountCents,
      currency: "usd",
      source_balance: { type: "payments" },
      destination_balance: { type: "issuing" },
      ...(params.description ? { description: params.description } : {}),
    },
    params.idempotencyKey
      ? { idempotencyKey: params.idempotencyKey }
      : undefined
  );
  return result as {
    id: string;
    object: string;
    amount: number;
    currency: string;
  };
}

/** ACH pull from the bank linked in Stripe Dashboard into Issuing. */
export async function createIssuingAchTopUp(params: {
  amountCents: number;
  description?: string;
  idempotencyKey?: string;
}) {
  if (params.amountCents < 1) {
    throw new Error("Top-up amount must be at least 1 cent");
  }
  const stripe = getStripeClient();
  // destination_balance is supported by Stripe Issuing docs but not yet in all SDK typings.
  const topup = await stripe.topups.create(
    {
      amount: params.amountCents,
      currency: "usd",
      description: params.description ?? "Issuing auto top-up",
      statement_descriptor: "Issuing",
      destination_balance: "issuing",
    } as Stripe.TopupCreateParams & { destination_balance: "issuing" },
    params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined
  );
  return topup;
}
