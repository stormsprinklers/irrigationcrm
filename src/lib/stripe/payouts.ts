import { PaymentMethod } from "@prisma/client";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe/client";
import type {
  PayoutPaymentLine,
  StripePayoutRow,
  StripePayoutsSummary,
} from "@/lib/stripe/payout-types";
import { toNumber } from "@/lib/visits/totals";

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

function paymentIntentIdFromSource(source: Stripe.BalanceTransactionSource | string | null) {
  if (!source || typeof source === "string") return null;
  if (source.object === "charge") {
    const pi = source.payment_intent;
    if (typeof pi === "string") return pi;
    if (pi && typeof pi === "object" && "id" in pi) return pi.id;
  }
  return null;
}

function chargeAmountAndCreated(source: Stripe.BalanceTransactionSource | string | null) {
  if (!source || typeof source === "string") return null;
  if (source.object === "charge") {
    return {
      amountCents: source.amount,
      created: source.created,
      name:
        source.billing_details?.name ||
        source.description ||
        null,
    };
  }
  return null;
}

export async function getCashCheckExpected(companyId: string): Promise<{
  cashCheckExpectedCents: number;
  cashCheckPayments: PayoutPaymentLine[];
}> {
  const where = {
    refundedAt: null,
    method: { in: [PaymentMethod.CASH, PaymentMethod.CHECK] },
    invoice: { companyId },
  };

  const [sum, rows] = await Promise.all([
    prisma.payment.aggregate({ where, _sum: { amount: true } }),
    prisma.payment.findMany({
      where,
      orderBy: { paidAt: "desc" },
      take: 200,
      select: {
        amount: true,
        paidAt: true,
        method: true,
        invoice: { select: { customer: { select: { name: true } } } },
      },
    }),
  ]);

  return {
    cashCheckExpectedCents: Math.round(toNumber(sum._sum.amount ?? 0) * 100),
    cashCheckPayments: rows.map((row) => ({
      amountCents: Math.round(toNumber(row.amount) * 100),
      customerName: row.invoice.customer.name,
      paidAt: row.paidAt.toISOString(),
      method: row.method,
    })),
  };
}

export async function getPayoutAssociatedPayments(
  companyId: string,
  payoutId: string
): Promise<PayoutPaymentLine[]> {
  const stripe = getStripeClient();
  await stripe.payouts.retrieve(payoutId);

  const charges: Array<{
    paymentIntentId: string | null;
    amountCents: number;
    created: number;
    fallbackName: string | null;
  }> = [];

  let startingAfter: string | undefined;
  for (;;) {
    const page = await stripe.balanceTransactions.list({
      payout: payoutId,
      limit: 100,
      starting_after: startingAfter,
      expand: ["data.source"],
    });
    for (const tx of page.data) {
      if (tx.type === "stripe_fee" || tx.type === "payout" || tx.reporting_category === "fee") {
        continue;
      }
      const charge = chargeAmountAndCreated(tx.source);
      if (!charge || charge.amountCents <= 0) continue;
      charges.push({
        paymentIntentId: paymentIntentIdFromSource(tx.source),
        amountCents: charge.amountCents,
        created: charge.created,
        fallbackName: charge.name,
      });
    }
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1]!.id;
  }

  const piIds = charges.map((c) => c.paymentIntentId).filter((id): id is string => Boolean(id));
  const crmPayments =
    piIds.length === 0
      ? []
      : await prisma.payment.findMany({
          where: {
            stripePaymentIntentId: { in: piIds },
            invoice: { companyId },
          },
          select: {
            stripePaymentIntentId: true,
            amount: true,
            paidAt: true,
            invoice: { select: { customer: { select: { name: true } } } },
          },
        });

  const byPi = new Map(
    crmPayments.map((p) => [
      p.stripePaymentIntentId,
      {
        customerName: p.invoice.customer.name,
        amountCents: Math.round(toNumber(p.amount) * 100),
        paidAt: p.paidAt.toISOString(),
      },
    ])
  );

  return charges.map((charge) => {
    const crm = charge.paymentIntentId ? byPi.get(charge.paymentIntentId) : undefined;
    return {
      amountCents: crm?.amountCents ?? charge.amountCents,
      customerName: crm?.customerName ?? charge.fallbackName ?? "Unknown customer",
      paidAt: crm?.paidAt ?? new Date(charge.created * 1000).toISOString(),
    };
  });
}

export async function getStripePayoutsSummary(companyId: string): Promise<StripePayoutsSummary> {
  const stripe = getStripeClient();
  const [balance, payoutList, cashCheck] = await Promise.all([
    stripe.balance.retrieve(),
    stripe.payouts.list({ limit: 100 }),
    getCashCheckExpected(companyId),
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
    cashCheckExpectedCents: cashCheck.cashCheckExpectedCents,
    cashCheckPayments: cashCheck.cashCheckPayments,
    nextPayout: upcoming[0] ?? null,
    payouts,
  };
}
