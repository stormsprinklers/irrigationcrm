import { AppNotificationType, UserRole } from "@prisma/client";
import { notifyStaffInApp } from "@/lib/notifications/in-app";
import { prisma } from "@/lib/prisma";
import {
  createIssuingAchTopUp,
  getIssuingFundingBalances,
  getTopUpStatus,
  transferPaymentsToIssuing,
  type FundingBalances,
} from "@/lib/stripe/issuing/funding";

/** Instant Stripe balance transfers — short cooldown is enough. */
const BALANCE_TRANSFER_COOLDOWN_MS = 60 * 60 * 1000;
/**
 * ACH can take 3–5 business days. While a pull is pending (or recently started),
 * never start another ACH — even if Stripe's pending list is briefly empty.
 */
const ACH_PENDING_LOCK_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_TOP_UP_CENTS = 500; // $5 floor
const ALERT_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export type AutoTopUpCompany = {
  id: string;
  name: string;
  expenseCardAutoTopUpEnabled: boolean;
  expenseCardMinBalanceCents: number;
  expenseCardTopUpAmountCents: number;
  expenseCardAchFallbackEnabled: boolean;
  expenseCardLastTopUpAt: Date | null;
  expenseCardLastTopUpStatus: string | null;
  expenseCardLastTopUpMethod?: string | null;
  expenseCardLastTopUpStripeId?: string | null;
  expenseCardLastTopUpError?: string | null;
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

async function alertAdmins(
  company: AutoTopUpCompany,
  title: string,
  body: string,
  options?: { force?: boolean }
) {
  // Avoid hourly spam when balance stays low / funding stays blocked.
  if (
    !options?.force &&
    company.expenseCardLastTopUpAt &&
    company.expenseCardLastTopUpStatus &&
    ["failed", "alert_only", "pending"].includes(company.expenseCardLastTopUpStatus) &&
    Date.now() - company.expenseCardLastTopUpAt.getTime() < ALERT_COOLDOWN_MS
  ) {
    return;
  }

  const admins = await prisma.user.findMany({
    where: { companyId: company.id, status: "ACTIVE", role: UserRole.ADMIN },
    select: { id: true },
  });
  if (!admins.length) return;
  await notifyStaffInApp({
    companyId: company.id,
    type: AppNotificationType.EXPENSE_CARD_FUNDING,
    title,
    body,
    href: "/settings/expense-cards",
    userIds: admins.map((a) => a.id),
  });
}

/**
 * Refresh CRM status from Stripe when the last ACH top-up may have settled.
 * Returns updated company fields (status may clear from pending → succeeded/failed).
 */
async function refreshPendingAchStatus(company: AutoTopUpCompany): Promise<AutoTopUpCompany> {
  if (
    company.expenseCardLastTopUpMethod !== "ach_topup" ||
    company.expenseCardLastTopUpStatus !== "pending" ||
    !company.expenseCardLastTopUpStripeId
  ) {
    return company;
  }

  try {
    const topup = await getTopUpStatus(company.expenseCardLastTopUpStripeId);
    if (!topup) return company;

    if (topup.status === "pending") return company;

    const nextStatus =
      topup.status === "succeeded"
        ? "succeeded"
        : topup.status === "failed" || topup.status === "canceled"
          ? "failed"
          : company.expenseCardLastTopUpStatus;

    await prisma.company.update({
      where: { id: company.id },
      data: {
        expenseCardLastTopUpStatus: nextStatus,
        expenseCardLastTopUpError:
          topup.status === "succeeded"
            ? null
            : topup.failure_message ?? `ACH top-up ${topup.status}`,
      },
    });

    return {
      ...company,
      expenseCardLastTopUpStatus: nextStatus,
      expenseCardLastTopUpError:
        topup.status === "succeeded"
          ? null
          : topup.failure_message ?? `ACH top-up ${topup.status}`,
    };
  } catch (err) {
    console.error("[expense-card-topup] failed to refresh ACH status", err);
    return company;
  }
}

function achLockActive(company: AutoTopUpCompany, now = Date.now()) {
  if (company.expenseCardLastTopUpMethod !== "ach_topup") return false;
  if (company.expenseCardLastTopUpStatus !== "pending") return false;
  if (!company.expenseCardLastTopUpAt) return true; // unknown age — stay locked
  return now - company.expenseCardLastTopUpAt.getTime() < ACH_PENDING_LOCK_MS;
}

function recentBalanceTransferCooldown(company: AutoTopUpCompany, now = Date.now()) {
  if (!company.expenseCardLastTopUpAt) return false;
  if (company.expenseCardLastTopUpMethod !== "stripe_balance") return false;
  if (company.expenseCardLastTopUpStatus !== "succeeded") return false;
  return now - company.expenseCardLastTopUpAt.getTime() < BALANCE_TRANSFER_COOLDOWN_MS;
}

/**
 * If Issuing balance is below the company minimum, refill from Payments balance
 * (preferred) or ACH bank pull (optional fallback).
 *
 * ACH safety: never stack pulls while Stripe shows a pending top-up, and keep a
 * 7-day lock after starting an ACH so hourly cron cannot re-debit during settlement.
 */
export async function runExpenseCardAutoTopUpForCompany(
  company: AutoTopUpCompany,
  options?: { force?: boolean }
): Promise<AutoTopUpResult> {
  if (!company.expenseCardAutoTopUpEnabled && !options?.force) {
    return { companyId: company.id, action: "skipped", reason: "Auto top-up disabled" };
  }

  company = await refreshPendingAchStatus(company);

  const minCents = Math.max(0, company.expenseCardMinBalanceCents);
  const refillCents = Math.max(MIN_TOP_UP_CENTS, company.expenseCardTopUpAmountCents);

  let balances: FundingBalances;
  try {
    balances = await getIssuingFundingBalances();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read Stripe balances";
    await persistOutcome(company.id, { status: "failed", error: message });
    await alertAdmins(company, "Expense card funding error", message, options);
    return { companyId: company.id, action: "failed", reason: message };
  }

  // Treat in-flight ACH as already covering Issuing so we don't keep refilling.
  const projectedIssuing = balances.issuingAvailableCents + balances.pendingAchTopUpCents;
  if (projectedIssuing >= minCents) {
    return {
      companyId: company.id,
      action: "skipped",
      reason:
        balances.pendingAchTopUpCents > 0
          ? `Issuing + pending ACH ($${(projectedIssuing / 100).toFixed(2)}) meets the minimum — waiting for ACH to settle`
          : `Issuing balance ($${(projectedIssuing / 100).toFixed(2)}) is at or above minimum`,
      balances,
    };
  }

  const amountCents = refillCents;
  const dayBucket = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const idempotencyKey = `issuing-topup-${company.id}-${dayBucket}`;

  const canTryStripeBalance =
    balances.paymentsAvailableCents >= amountCents &&
    (options?.force || !recentBalanceTransferCooldown(company));

  // Preferred: Stripe Payments → Issuing (instant). Still OK while ACH is pending.
  if (canTryStripeBalance) {
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
      if (!company.expenseCardAchFallbackEnabled) {
        await persistOutcome(company.id, { status: "failed", error: message, amountCents });
        await alertAdmins(
          company,
          "Expense card auto top-up failed",
          `Could not move $${(amountCents / 100).toFixed(2)} from Stripe balance: ${message}`,
          options
        );
        return { companyId: company.id, action: "failed", reason: message, balances };
      }
      console.error("[expense-card-topup] balance transfer failed, trying ACH", err);
    }
  } else if (
    balances.paymentsAvailableCents < amountCents &&
    !company.expenseCardAchFallbackEnabled
  ) {
    const reason = `Issuing below minimum ($${(minCents / 100).toFixed(2)}) but Payments balance only has $${(balances.paymentsAvailableCents / 100).toFixed(2)} — enable ACH fallback or add funds.`;
    await persistOutcome(company.id, { status: "failed", error: reason });
    await alertAdmins(company, "Expense card Issuing balance low", reason, options);
    return { companyId: company.id, action: "alert_only", reason, balances };
  }

  // ACH fallback — never stack while another pull is in flight.
  if (company.expenseCardAchFallbackEnabled) {
    if (balances.pendingAchTopUpCents > 0) {
      return {
        companyId: company.id,
        action: "skipped",
        reason: `ACH top-up already pending ($${(balances.pendingAchTopUpCents / 100).toFixed(2)}) — will not start another until it settles (usually 3–5 business days)`,
        balances,
      };
    }

    if (achLockActive(company) && !options?.force) {
      return {
        companyId: company.id,
        action: "skipped",
        reason:
          "ACH top-up lock active (up to 7 days after a pending pull) — preventing repeat bank charges while funds settle",
        balances,
      };
    }

    // Manual "Top up now" still must not stack if CRM thinks ACH is pending
    // and we could not confirm settlement yet.
    if (options?.force && achLockActive(company)) {
      return {
        companyId: company.id,
        action: "skipped",
        reason:
          "An ACH top-up is still marked pending. Wait for it to settle (3–5 business days) or check Stripe Dashboard before pulling again.",
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
        reason:
          topup.status === "succeeded"
            ? "ACH top-up completed"
            : "Initiated ACH pull — no further ACH pulls until this settles (usually 3–5 business days)",
        amountCents,
        method: "ach_topup",
        stripeId: topup.id,
        balances,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "ACH top-up failed";
      await persistOutcome(company.id, { status: "failed", error: message, amountCents });
      await alertAdmins(
        company,
        "Expense card ACH top-up failed",
        `Could not pull $${(amountCents / 100).toFixed(2)} from bank: ${message}. Link a bank in the Stripe Dashboard if needed.`,
        options
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
      expenseCardLastTopUpMethod: true,
      expenseCardLastTopUpStripeId: true,
      expenseCardLastTopUpError: true,
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
