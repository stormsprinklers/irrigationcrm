import { NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  listIssuingAuthorizations,
  listIssuingTransactions,
} from "@/lib/stripe/issuing/cards";

/** Recent Stripe Issuing activity for the company (fetched live — no card secrets). */
export async function GET() {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return forbiddenResponse();
    }

    const cards = await prisma.expenseCard.findMany({
      where: { companyId: user.companyId },
      select: {
        id: true,
        stripeCardId: true,
        last4: true,
        user: { select: { id: true, name: true } },
      },
    });

    const byStripeId = new Map(cards.map((c) => [c.stripeCardId, c]));

    const [auths, txns] = await Promise.all([
      listIssuingAuthorizations({ limit: 40 }),
      listIssuingTransactions({ limit: 40 }),
    ]);

    const authorizations = auths.data
      .filter((a) => byStripeId.has(typeof a.card === "string" ? a.card : a.card?.id ?? ""))
      .map((a) => {
        const cardId = typeof a.card === "string" ? a.card : a.card?.id ?? "";
        const local = byStripeId.get(cardId);
        return {
          id: a.id,
          amount: a.amount,
          currency: a.currency,
          approved: a.approved,
          status: a.status,
          merchantName: a.merchant_data?.name ?? null,
          merchantCity: a.merchant_data?.city ?? null,
          merchantCountry: a.merchant_data?.country ?? null,
          created: a.created,
          cardLast4: local?.last4 ?? null,
          employeeName: local?.user.name ?? null,
          expenseCardId: local?.id ?? null,
        };
      });

    const transactions = txns.data
      .filter((t) => byStripeId.has(typeof t.card === "string" ? t.card : t.card?.id ?? ""))
      .map((t) => {
        const cardId = typeof t.card === "string" ? t.card : t.card?.id ?? "";
        const local = byStripeId.get(cardId);
        return {
          id: t.id,
          amount: t.amount,
          currency: t.currency,
          type: t.type,
          merchantName: t.merchant_data?.name ?? null,
          created: t.created,
          cardLast4: local?.last4 ?? null,
          employeeName: local?.user.name ?? null,
          expenseCardId: local?.id ?? null,
        };
      });

    return NextResponse.json({ authorizations, transactions });
  } catch (error) {
    if (error instanceof Error && error.message.includes("STRIPE_SECRET_KEY")) {
      return NextResponse.json({ error: error.message, authorizations: [], transactions: [] });
    }
    console.error("[expense-cards] activity", error);
    return unauthorizedResponse();
  }
}
