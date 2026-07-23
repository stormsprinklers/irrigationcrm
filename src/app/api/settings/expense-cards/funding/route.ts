import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { verifyExpenseCardActionToken } from "@/lib/expense-cards/action-token";
import { runExpenseCardAutoTopUpForCompany } from "@/lib/expense-cards/auto-topup";
import { getIssuingFundingBalances } from "@/lib/stripe/issuing/funding";
import { prisma } from "@/lib/prisma";

function requireMfaToken(request: NextRequest, body: Record<string, unknown>) {
  return (
    (typeof body.actionToken === "string" && body.actionToken) ||
    request.headers.get("x-expense-card-mfa")?.trim() ||
    ""
  );
}

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return forbiddenResponse();
    }

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        expenseCardsEnabled: true,
        expenseCardAutoTopUpEnabled: true,
        expenseCardMinBalanceCents: true,
        expenseCardTopUpAmountCents: true,
        expenseCardAchFallbackEnabled: true,
        expenseCardLastTopUpAt: true,
        expenseCardLastTopUpAmountCents: true,
        expenseCardLastTopUpMethod: true,
        expenseCardLastTopUpStatus: true,
        expenseCardLastTopUpError: true,
        expenseCardLastTopUpStripeId: true,
      },
    });
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    let balances = null;
    let balanceError: string | null = null;
    try {
      balances = await getIssuingFundingBalances();
    } catch (err) {
      balanceError = err instanceof Error ? err.message : "Failed to load balances";
    }

    return NextResponse.json({
      enabled: company.expenseCardsEnabled,
      autoTopUp: {
        enabled: company.expenseCardAutoTopUpEnabled,
        minBalanceCents: company.expenseCardMinBalanceCents,
        topUpAmountCents: company.expenseCardTopUpAmountCents,
        achFallbackEnabled: company.expenseCardAchFallbackEnabled,
        lastAt: company.expenseCardLastTopUpAt?.toISOString() ?? null,
        lastAmountCents: company.expenseCardLastTopUpAmountCents,
        lastMethod: company.expenseCardLastTopUpMethod,
        lastStatus: company.expenseCardLastTopUpStatus,
        lastError: company.expenseCardLastTopUpError,
        lastStripeId: company.expenseCardLastTopUpStripeId,
      },
      balances,
      balanceError,
      canMutate: user.role === "ADMIN",
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN") return forbiddenResponse();

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const token = requireMfaToken(request, body);
    const mfa = await verifyExpenseCardActionToken(token, {
      userId: user.id,
      companyId: user.companyId,
    });
    if (!mfa.ok) {
      return NextResponse.json({ error: mfa.error }, { status: 401 });
    }

    const action = typeof body.action === "string" ? body.action : "run_now";
    if (action !== "run_now") {
      return badRequestResponse('action must be "run_now"');
    }

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        id: true,
        name: true,
        expenseCardsEnabled: true,
        expenseCardAutoTopUpEnabled: true,
        expenseCardMinBalanceCents: true,
        expenseCardTopUpAmountCents: true,
        expenseCardAchFallbackEnabled: true,
        expenseCardLastTopUpAt: true,
        expenseCardLastTopUpStatus: true,
      },
    });
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
    if (!company.expenseCardsEnabled) {
      return badRequestResponse("Enable expense cards before running a top-up");
    }

    const result = await runExpenseCardAutoTopUpForCompany(
      { ...company, expenseCardAutoTopUpEnabled: true },
      { force: true }
    );

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("[expense-cards/funding] run failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Top-up failed" },
      { status: 500 }
    );
  }
}
