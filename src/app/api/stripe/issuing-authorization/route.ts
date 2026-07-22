import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { ExpenseCardStatus } from "@prisma/client";
import { resolveEffectiveControls } from "@/lib/expense-cards/controls";
import { prisma } from "@/lib/prisma";
import { getOpenClockEntry } from "@/lib/timesheets/clock";

export const runtime = "nodejs";

/**
 * Synchronous Stripe Issuing authorization webhook.
 * Must respond within ~2s. Configure Autopilot/timeout to decline on failure.
 *
 * Env: STRIPE_ISSUING_AUTH_WEBHOOK_SECRET (preferred) or STRIPE_WEBHOOK_SECRET
 */
export async function POST(request: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret =
    process.env.STRIPE_ISSUING_AUTH_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey || !webhookSecret) {
    return NextResponse.json({ error: "Stripe Issuing auth webhook not configured" }, { status: 503 });
  }

  const stripe = new Stripe(secretKey);
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await request.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[issuing-auth] signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "issuing_authorization.request") {
    return NextResponse.json({ received: true });
  }

  const auth = event.data.object as Stripe.Issuing.Authorization;
  const decision = await decideAuthorization(auth);

  return NextResponse.json(
    { approved: decision.approved },
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // Stripe docs require Stripe-Version on auth webhook responses
        "Stripe-Version": event.api_version ?? "2025-03-31.basil",
      },
    }
  );
}

async function decideAuthorization(
  auth: Stripe.Issuing.Authorization
): Promise<{ approved: boolean; reason?: string }> {
  try {
    const stripeCardId =
      typeof auth.card === "string" ? auth.card : auth.card?.id ?? null;
    if (!stripeCardId) {
      return { approved: false, reason: "missing_card" };
    }

    const card = await prisma.expenseCard.findUnique({
      where: { stripeCardId },
      include: {
        user: { select: { id: true, role: true, status: true } },
        company: {
          select: {
            expenseCardsEnabled: true,
            expenseCardDefaultsJson: true,
          },
        },
      },
    });

    if (!card || !card.company.expenseCardsEnabled) {
      return { approved: false, reason: "unknown_or_disabled" };
    }
    if (card.status !== ExpenseCardStatus.ACTIVE) {
      return { approved: false, reason: "card_inactive" };
    }
    if (card.user.status !== "ACTIVE") {
      return { approved: false, reason: "employee_inactive" };
    }

    const openClock = await getOpenClockEntry(card.userId);
    if (!openClock) {
      return { approved: false, reason: "not_clocked_in" };
    }

    const rolePolicy = await prisma.expenseCardRolePolicy.findUnique({
      where: {
        companyId_role: { companyId: card.companyId, role: card.user.role },
      },
    });

    const controls = resolveEffectiveControls({
      companyDefaults: card.company.expenseCardDefaultsJson,
      rolePolicy,
      card,
    });

    // Defense in depth: spending_controls.blocked_card_presences should already
    // decline CNP before this webhook; still gate on presence + method.
    const cardPresence = String(auth.card_presence ?? "").toLowerCase();
    const method = String(auth.authorization_method ?? "").toLowerCase();
    if (
      controls.blockOnline &&
      (cardPresence === "not_present" ||
        method === "online" ||
        method === "keyed_in")
    ) {
      return { approved: false, reason: "online_blocked" };
    }

    const country = (auth.merchant_data?.country ?? "").toUpperCase();
    if (controls.blockInternational && country && country !== "US") {
      return { approved: false, reason: "international_blocked" };
    }

    const category = String(auth.merchant_data?.category ?? "").toLowerCase();
    if (
      controls.blockAtm &&
      (category.includes("cash") || category.includes("atm") || category === "automated_cash_disburse")
    ) {
      return { approved: false, reason: "atm_blocked" };
    }

    if (controls.allowedCategories.length) {
      const allowed = new Set(controls.allowedCategories.map((c) => c.toLowerCase()));
      if (category && !allowed.has(category)) {
        // Also allow if merchant category code matches loosely
        const match = [...allowed].some(
          (a) => category.includes(a) || a.includes(category)
        );
        if (!match) {
          return { approved: false, reason: "category_not_allowed" };
        }
      }
    }

    return { approved: true };
  } catch (err) {
    console.error("[issuing-auth] decision error — declining", err);
    return { approved: false, reason: "error" };
  }
}
