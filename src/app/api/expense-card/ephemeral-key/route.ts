import { NextRequest, NextResponse } from "next/server";
import { ExpenseCardStatus } from "@prisma/client";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe/client";

/** Exchange client nonce for Issuing Elements ephemeral key (own card only). */
export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json().catch(() => ({}));
    const nonce = typeof body.nonce === "string" ? body.nonce.trim() : "";
    const stripeVersion =
      (typeof body.stripeVersion === "string" && body.stripeVersion) ||
      process.env.STRIPE_API_VERSION ||
      "2025-03-31.basil";

    const card = await prisma.expenseCard.findFirst({
      where: {
        companyId: user.companyId,
        userId: user.id,
      },
    });
    if (!card || card.status !== ExpenseCardStatus.ACTIVE) {
      return NextResponse.json({ error: "No active expense card" }, { status: 404 });
    }

    const stripe = getStripeClient();
    const key = await stripe.ephemeralKeys.create(
      {
        issuing_card: card.stripeCardId,
        ...(nonce ? { nonce } : {}),
      } as { issuing_card: string; nonce?: string },
      { apiVersion: stripeVersion as never }
    );

    return NextResponse.json({
      ephemeralKeySecret: key.secret ?? null,
      stripeCardId: card.stripeCardId,
    });
  } catch (error) {
    console.error("[expense-card] ephemeral-key", error);
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to create ephemeral key";
    if (message.includes("STRIPE")) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return badRequestResponse(message);
  }
}
