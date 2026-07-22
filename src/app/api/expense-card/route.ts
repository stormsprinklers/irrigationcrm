import { NextResponse } from "next/server";
import { ExpenseCardStatus, type UserRole } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { resolveEffectiveControls } from "@/lib/expense-cards/controls";
import { prisma } from "@/lib/prisma";
import { getOpenClockEntry } from "@/lib/timesheets/clock";
import { getStripePublishableKey } from "@/lib/stripe/client";

/** Current employee's expense card metadata (secrets via /ephemeral-key + Elements). */
export async function GET() {
  try {
    const user = await requireSessionUser();

    const card = await prisma.expenseCard.findFirst({
      where: {
        companyId: user.companyId,
        userId: user.id,
      },
    });

    if (!card || card.status === ExpenseCardStatus.CANCELED) {
      return NextResponse.json({ card: null });
    }

    const [company, rolePolicy, openClock] = await Promise.all([
      prisma.company.findUnique({
        where: { id: user.companyId },
        select: { expenseCardsEnabled: true, expenseCardDefaultsJson: true },
      }),
      prisma.expenseCardRolePolicy.findUnique({
        where: {
          companyId_role: {
            companyId: user.companyId,
            role: user.role as UserRole,
          },
        },
      }),
      getOpenClockEntry(user.id),
    ]);

    const controls = resolveEffectiveControls({
      companyDefaults: company?.expenseCardDefaultsJson,
      rolePolicy,
      card,
    });

    return NextResponse.json({
      card: {
        id: card.id,
        status: card.status,
        last4: card.last4,
        stripeCardId: card.stripeCardId,
      },
      controls,
      clockedIn: Boolean(openClock),
      publishableKey: getStripePublishableKey(),
      stripeCardId: card.stripeCardId,
      programEnabled: Boolean(company?.expenseCardsEnabled),
    });
  } catch {
    return unauthorizedResponse();
  }
}
