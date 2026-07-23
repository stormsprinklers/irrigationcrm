import { AppNotificationType, UserRole } from "@prisma/client";
import { notifyStaffInApp } from "@/lib/notifications/in-app";
import { prisma } from "@/lib/prisma";
import {
  createIssuingAchTopUp,
  getIssuingFundingBalances,
  transferPaymentsToIssuing,
  type FundingBalances,
} from "@/lib/stripe/issuing/funding";

const COOLDOWN_MS = 60 * 60 * 1000; // avoid repeat transfers within an hour
const MIN_TOP_UP_CENTS = 500; // $5 floor

export type AutoTopUpCompany = {
  id: string;
  name: string;
  expenseCardAutoTopUpEnabled: boolean;
  expenseCardMinBalanceCents: number;
  expenseCardTopUpAmountCents: number;
  expenseCardAchFallbackEnabled: boolean;
  expenseCardLastTopUpAt: Date | null;
  expenseCardLastTopUpStatus: string | null;
};

export type AutoTopUpResult = {
  companyId: string;
  action: "skipped" | "transferred" | "ach_pending" | "failed" | "alert_only";
  reason: string;
  amountCents?: number;
  method?: "stripe_balance" | "ach_topup";
  stripeId?: string;
  balances?: FundingBalances;
};

async function persistOutcome(
  companyId: string,
  data: {
    status: string;
    error?: string | null;
    amountCents?: number | null;
    method?: string | null;
    stripeId?: string | null;
  }
) {
  await prisma.company.update({
    where: { id: companyId },
    data: {
      expenseCardLastTopUpAt: new Date(),
      expenseCardLastTopUpStatus: data.status,
      expenseCardLastTopUpError: data.error ?? null,
      expenseCardLastTopUpAmountCents: data.amountCents ?? null,
      expenseCardLastTopUpMethod: data.method ?? null,
      expenseCardLastTopUpStripeId: data.stripeId ?? null,
    },
  });
}

async function alertAdmins(companyId: string, title: string, body: string) {
  const admins = await prisma.user.findMany({
    where: { companyId, status: "ACTIVE", role: UserRole.ADMIN },
    select: { id: true },
  });
  if (!admins.length) return;
  await notifyStaffInApp({
    companyId,
    type: AppNotificationType.EXPENSE_CARD_FUNDING,
    title,
    body,
    href: "/settings/expense-cards",
    userIds: admins.map((a) => a.id),
  });
}

/**
 * If Issuing balance is below the company minimum, refill from Payments balance
 * (preferred) or ACH bank pull (optional fallback).
 */
export async function runExpenseCardAutoTopUpForCompany(
  company: AutoTopUpCompany,
  options?: { force?: boolean }
): Promise<AutoTopUpResult> {
  if (!company.expenseCardAutoTopUpEnabled && !options?.force) {
    return { companyId: company.id, action: "skipped", reason: "Auto top-up disabled" };
  }

  const minCents = Math.max(0, company.expenseCardMinBalanceCents);
  const refillCents = Math.max(MIN_TOP_UP_CENTS, company.expenseCardTopUpAmountCents);

  if (
    !options?.force &&
    company.expenseCardLastTopUpAt &&
    company.expenseCardLastTopUpStatus &&
    ["succeeded", "pending"].includes(company.expenseCardLastTopUpStatus) &&
    Date.now() - company.expenseCardLastTopUpAt.getTime() < COOLDOWN_MS
  ) {
    return {
      companyId: company.id,
      action: "skipped",
      reason: "Cooldown — recent top-up already ran",
    };
  }

  let balances: FundingBalances;
  try {
    balances = await getIssuingFundingBalances();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read Stripe balances";
    await persistOutcome(company.id, { status: "failed", error: message });
    await alertAdmins(company.id, "Expense card funding error", message);
    return { companyId: company.id, action: "failed", reason: message };
  }

  const spendableIssuing = balances.issuingAvailableCents + balances.pendingAchTopUpCents;
  if (spendableIssuing >= minCents) {
    return {
      companyId: company.id,
      action: "skipped",
      reason: `Issuing balance ($${((spendableIssuing) / 100).toFixed(2)}) is at or above minimum`,
      balances,
    };
  }

  const amountCents = refillCents;
  const idempotencyKey = `issuing-topup-${company.id}-${Math.floor(Date.now() / COOLDOWN_MS)}`;

  // Preferred: Stripe Payments → Issuing
  if (balances.paymentsAvailableCents >= amountCents) {
    try {
      const transfer = await transferPaymentsToIssuing({
        amountCents,
        description: `Expense card auto top-up for ${company.name}`,
        idempotencyKey: `${idempotencyKey}-balance`,
      });
      await persistOutcome(company.id, {
        status: "succeeded",
        amountCents,
        method: "stripe_balance",
        stripeId: transfer.id,
        error: null,
      });
      return {
        companyId: company.id,
        action: "transferred",
        reason: "Moved funds from Stripe Payments balance to Issuing",
        amountCents,
        method: "stripe_balance",
        stripeId: transfer.id,
        balances,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Balance transfer failed";
      // Fall through to ACH if enabled
      if (!company.expenseCardAchFallbackEnabled) {
        await persistOutcome(company.id, { status: "failed", error: message, amountCents });
        await alertAdmins(
          company.id,
          "Expense card auto top-up failed",
          `Could not move $${(amountCents / 100).toFixed(2)} from Stripe balance: ${message}`
        );
        return { companyId: company.id, action: "failed", reason: message, balances };
      }
      console.error("[expense-card-topup] balance transfer failed, trying ACH", err);
    }
  } else if (!company.expenseCardAchFallbackEnabled) {
    const reason = `Issuing below minimum ($${(minCents / 100).toFixed(2)}) but Payments balance only has $${(balances.paymentsAvailableCents / 100).toFixed(2)} — enable ACH fallback or add funds.`;
    await persistOutcome(company.id, { status: "failed", error: reason });
    await alertAdmins(company.id, "Expense card Issuing balance low", reason);
    return { companyId: company.id, action: "alert_only", reason, balances };
  }

  // ACH fallback
  if (company.expenseCardAchFallbackEnabled) {
    if (balances.pendingAchTopUpCents > 0) {
      return {
        companyId: company.id,
        action: "skipped",
        reason: "ACH top-up already pending",
        balances,
      };
    }
    try {
      const topup = await createIssuingAchTopUp({
        amountCents,
        description: `Expense card ACH top-up for ${company.name}`,
        idempotencyKey: `${idempotencyKey}-ach`,
      });
      await persistOutcome(company.id, {
        status: topup.status === "succeeded" ? "succeeded" : "pending",
        amountCents,
        method: "ach_topup",
        stripeId: topup.id,
        error: null,
      });
      return {
        companyId: company.id,
        action: topup.status === "succeeded" ? "transferred" : "ach_pending",
        reason: "Initiated ACH pull from linked bank into Issuing",
        amountCents,
        method: "ach_topup",
        stripeId: topup.id,
        balances,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "ACH top-up failed";
      await persistOutcome(company.id, { status: "failed", error: message, amountCents });
      await alertAdmins(
        company.id,
        "Expense card ACH top-up failed",
        `Could not pull $${(amountCents / 100).toFixed(2)} from bank: ${message}. Link a bank in the Stripe Dashboard if needed.`
      );
      return { companyId: company.id, action: "failed", reason: message, balances };
    }
  }

  const reason = "Unable to top up Issuing balance";
  await persistOutcome(company.id, { status: "failed", error: reason });
  return { companyId: company.id, action: "failed", reason, balances };
}

export async function runExpenseCardAutoTopUps() {
  const companies = await prisma.company.findMany({
    where: {
      expenseCardsEnabled: true,
      expenseCardAutoTopUpEnabled: true,
    },
    select: {
      id: true,
      name: true,
      expenseCardAutoTopUpEnabled: true,
      expenseCardMinBalanceCents: true,
      expenseCardTopUpAmountCents: true,
      expenseCardAchFallbackEnabled: true,
      expenseCardLastTopUpAt: true,
      expenseCardLastTopUpStatus: true,
    },
  });

  const results: AutoTopUpResult[] = [];
  for (const company of companies) {
    try {
      results.push(await runExpenseCardAutoTopUpForCompany(company));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      results.push({ companyId: company.id, action: "failed", reason: message });
    }
  }
  return results;
}
