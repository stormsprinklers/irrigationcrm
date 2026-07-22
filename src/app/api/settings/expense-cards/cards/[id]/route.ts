import { NextRequest, NextResponse } from "next/server";
import { ExpenseCardStatus } from "@prisma/client";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { verifyExpenseCardActionToken } from "@/lib/expense-cards/action-token";
import { resolveEffectiveControls } from "@/lib/expense-cards/controls";
import { prisma } from "@/lib/prisma";
import { updateIssuingCardControls } from "@/lib/stripe/issuing/cards";

type Params = { params: Promise<{ id: string }> };

function requireMfaToken(request: NextRequest, body: Record<string, unknown>) {
  return (
    (typeof body.actionToken === "string" && body.actionToken) ||
    request.headers.get("x-expense-card-mfa")?.trim() ||
    ""
  );
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN") return forbiddenResponse();

    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const token = requireMfaToken(request, body);
    const mfa = await verifyExpenseCardActionToken(token, {
      userId: user.id,
      companyId: user.companyId,
    });
    if (!mfa.ok) {
      return NextResponse.json({ error: mfa.error }, { status: 401 });
    }

    const card = await prisma.expenseCard.findFirst({
      where: { id, companyId: user.companyId },
      include: { user: { select: { role: true } } },
    });
    if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { expenseCardDefaultsJson: true },
    });
    const rolePolicy = await prisma.expenseCardRolePolicy.findUnique({
      where: {
        companyId_role: { companyId: user.companyId, role: card.user.role },
      },
    });

    let status = card.status;
    if (typeof body.status === "string") {
      const next = body.status.toUpperCase();
      if (!["ACTIVE", "INACTIVE", "CANCELED"].includes(next)) {
        return badRequestResponse("Invalid status");
      }
      status = next as ExpenseCardStatus;
    }

    const nextOverrides = {
      dailyLimitCents:
        body.dailyLimitCents === null
          ? null
          : typeof body.dailyLimitCents === "number"
            ? body.dailyLimitCents
            : card.dailyLimitCents,
      monthlyLimitCents:
        body.monthlyLimitCents === null
          ? null
          : typeof body.monthlyLimitCents === "number"
            ? body.monthlyLimitCents
            : card.monthlyLimitCents,
      blockAtm:
        body.blockAtm === null
          ? null
          : typeof body.blockAtm === "boolean"
            ? body.blockAtm
            : card.blockAtm,
      blockInternational:
        body.blockInternational === null
          ? null
          : typeof body.blockInternational === "boolean"
            ? body.blockInternational
            : card.blockInternational,
      blockOnline:
        body.blockOnline === null
          ? null
          : typeof body.blockOnline === "boolean"
            ? body.blockOnline
            : card.blockOnline,
      allowedCategories: Array.isArray(body.allowedCategories)
        ? (body.allowedCategories as string[])
        : card.allowedCategories,
    };

    const controls = resolveEffectiveControls({
      companyDefaults: company?.expenseCardDefaultsJson,
      rolePolicy,
      card: nextOverrides,
    });

    const stripeStatus =
      status === ExpenseCardStatus.ACTIVE
        ? "active"
        : status === ExpenseCardStatus.CANCELED
          ? "canceled"
          : "inactive";

    await updateIssuingCardControls({
      stripeCardId: card.stripeCardId,
      controls,
      status: stripeStatus,
    });

    const updated = await prisma.expenseCard.update({
      where: { id: card.id },
      data: {
        status,
        dailyLimitCents: nextOverrides.dailyLimitCents,
        monthlyLimitCents: nextOverrides.monthlyLimitCents,
        blockAtm: nextOverrides.blockAtm,
        blockInternational: nextOverrides.blockInternational,
        blockOnline: nextOverrides.blockOnline,
        allowedCategories: nextOverrides.allowedCategories,
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    return NextResponse.json({ card: updated, effectiveControls: controls });
  } catch (error) {
    console.error("[expense-cards] update failed", error);
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to update card";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
