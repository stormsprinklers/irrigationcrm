import { getStripeClient } from "@/lib/stripe/client";
import type { StripePayoutRow, StripePayoutsSummary } from "@/lib/stripe/payout-types";

function sumUsd(rows: Array<{ amount: number; currency: string }> | undefined) {
  if (!rows?.length) return 0;
  return rows.filter((r) => r.currency === "usd").reduce((sum, r) => sum + r.amount, 0);
}

function toIsoDate(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

function serializePayout(payout: {
  id: string;
  amount: number;
  currency: string;
  status: string;
  arrival_date: number;
  created: number;
  method: string;
  description: string | null;
}): StripePayoutRow {
  return {
    id: payout.id,
    amountCents: payout.amount,
    currency: payout.currency,
    status: payout.status,
    arrivalDate: toIsoDate(payout.arrival_date),
    createdAt: toIsoDate(payout.created) ?? new Date().toISOString(),
    method: payout.method ?? null,
    description: payout.description,
  };
}

export async function getStripePayoutsSummary(): Promise<StripePayoutsSummary> {
  const stripe = getStripeClient();
  const [balance, payoutList] = await Promise.all([
    stripe.balance.retrieve(),
    stripe.payouts.list({ limit: 100 }),
  ]);

  const pendingCents = sumUsd(balance.pending);
  const availableCents = sumUsd(balance.available);
  const payouts = payoutList.data.map(serializePayout);

  const upcoming = payouts
    .filter((row) => row.status === "pending" || row.status === "in_transit")
    .sort((a, b) => {
      const aTime = a.arrivalDate ? new Date(a.arrivalDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.arrivalDate ? new Date(b.arrivalDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });

  return {
    unpaidCents: pendingCents + availableCents,
    pendingCents,
    availableCents,
    nextPayout: upcoming[0] ?? null,
    payouts,
  };
}
