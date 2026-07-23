import { NextRequest, NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { verifyExpenseCardActionToken } from "@/lib/expense-cards/action-token";
import {
  EXPENSE_CARD_ROLES,
  parseCompanyDefaults,
  type ExpenseCardControls,
} from "@/lib/expense-cards/controls";
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
        expenseCardDefaultsJson: true,
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
        address: true,
        city: true,
        state: true,
        zip: true,
      },
    });
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const [rolePolicies, cards, employees] = await Promise.all([
      prisma.expenseCardRolePolicy.findMany({
        where: { companyId: user.companyId },
        orderBy: { role: "asc" },
      }),
      prisma.expenseCard.findMany({
        where: { companyId: user.companyId },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true, status: true, phone: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.findMany({
        where: { companyId: user.companyId, status: "ACTIVE", systemKind: null },
        select: { id: true, name: true, email: true, role: true, phone: true },
        orderBy: { name: "asc" },
      }),
    ]);

    let balances = null;
    let balanceError: string | null = null;
    try {
      const { getIssuingFundingBalances } = await import("@/lib/stripe/issuing/funding");
      balances = await getIssuingFundingBalances();
    } catch (err) {
      balanceError = err instanceof Error ? err.message : "Failed to load Stripe balances";
    }

    return NextResponse.json({
      enabled: company.expenseCardsEnabled,
      defaults: parseCompanyDefaults(company.expenseCardDefaultsJson),
      companyBilling: {
        line1: company.address,
        city: company.city,
        state: company.state,
        postal_code: company.zip,
      },
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
      rolePolicies,
      roles: EXPENSE_CARD_ROLES,
      cards,
      employees,
      canMutate: user.role === "ADMIN",
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN") return forbiddenResponse();

    const body = (await request.json()) as Record<string, unknown>;
    const token = requireMfaToken(request, body);
    const mfa = await verifyExpenseCardActionToken(token, {
      userId: user.id,
      companyId: user.companyId,
    });
    if (!mfa.ok) {
      return NextResponse.json({ error: mfa.error }, { status: 401 });
    }

    if (body.enabled !== undefined || body.defaults !== undefined) {
      const current = await prisma.company.findUnique({
        where: { id: user.companyId },
        select: { expenseCardDefaultsJson: true },
      });
      const merged = {
        ...parseCompanyDefaults(current?.expenseCardDefaultsJson),
        ...((body.defaults as Partial<ExpenseCardControls>) ?? {}),
      };
      await prisma.company.update({
        where: { id: user.companyId },
        data: {
          ...(body.enabled !== undefined
            ? { expenseCardsEnabled: Boolean(body.enabled) }
            : {}),
          ...(body.defaults !== undefined
            ? { expenseCardDefaultsJson: merged as Prisma.InputJsonValue }
            : {}),
        },
      });
    }

    if (body.autoTopUp && typeof body.autoTopUp === "object") {
      const at = body.autoTopUp as {
        enabled?: boolean;
        minBalanceCents?: number;
        topUpAmountCents?: number;
        achFallbackEnabled?: boolean;
      };
      const minBalanceCents =
        at.minBalanceCents !== undefined
          ? Math.max(0, Math.round(Number(at.minBalanceCents) || 0))
          : undefined;
      const topUpAmountCents =
        at.topUpAmountCents !== undefined
          ? Math.max(500, Math.round(Number(at.topUpAmountCents) || 0))
          : undefined;
      await prisma.company.update({
        where: { id: user.companyId },
        data: {
          ...(at.enabled !== undefined
            ? { expenseCardAutoTopUpEnabled: Boolean(at.enabled) }
            : {}),
          ...(minBalanceCents !== undefined
            ? { expenseCardMinBalanceCents: minBalanceCents }
            : {}),
          ...(topUpAmountCents !== undefined
            ? { expenseCardTopUpAmountCents: topUpAmountCents }
            : {}),
          ...(at.achFallbackEnabled !== undefined
            ? { expenseCardAchFallbackEnabled: Boolean(at.achFallbackEnabled) }
            : {}),
        },
      });
    }

    if (body.rolePolicy && typeof body.rolePolicy === "object") {
      const rp = body.rolePolicy as {
        role: UserRole;
        dailyLimitCents?: number | null;
        monthlyLimitCents?: number | null;
        blockAtm?: boolean | null;
        blockInternational?: boolean | null;
        blockOnline?: boolean | null;
        allowedCategories?: string[];
      };
      if (!rp.role || !EXPENSE_CARD_ROLES.includes(rp.role)) {
        return badRequestResponse("Invalid role for policy");
      }
      await prisma.expenseCardRolePolicy.upsert({
        where: {
          companyId_role: { companyId: user.companyId, role: rp.role },
        },
        create: {
          companyId: user.companyId,
          role: rp.role,
          dailyLimitCents: rp.dailyLimitCents ?? null,
          monthlyLimitCents: rp.monthlyLimitCents ?? null,
          blockAtm: rp.blockAtm ?? null,
          blockInternational: rp.blockInternational ?? null,
          blockOnline: rp.blockOnline ?? null,
          allowedCategories: rp.allowedCategories ?? [],
        },
        update: {
          dailyLimitCents: rp.dailyLimitCents ?? null,
          monthlyLimitCents: rp.monthlyLimitCents ?? null,
          blockAtm: rp.blockAtm ?? null,
          blockInternational: rp.blockInternational ?? null,
          blockOnline: rp.blockOnline ?? null,
          allowedCategories: rp.allowedCategories ?? [],
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
