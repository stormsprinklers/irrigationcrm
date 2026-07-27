import { getStripeClient } from "@/lib/stripe/client";

export type IssuingCardFundingSource =
  | { kind: "v2"; id: string; source: "env" | "list" }
  | { kind: "treasury"; id: string; source: "env" | "list" };

/**
 * Newer Stripe Issuing / Cross River prepaid programs require attaching a
 * Financial Account when creating cards (`financial_account_v2` or
 * Treasury `financial_account`). Classic Issuing-balance programs do not.
 */
export async function resolveIssuingCardFundingSource(): Promise<IssuingCardFundingSource | null> {
  const v2Env = process.env.STRIPE_ISSUING_FINANCIAL_ACCOUNT_V2?.trim();
  if (v2Env) return { kind: "v2", id: v2Env, source: "env" };

  const treasuryEnv = process.env.STRIPE_ISSUING_FINANCIAL_ACCOUNT?.trim();
  if (treasuryEnv) return { kind: "treasury", id: treasuryEnv, source: "env" };

  const stripe = getStripeClient();

  // Prefer Accounts v2 / money-management Financial Accounts when present.
  try {
    const listed = (await stripe.rawRequest("GET", "/v2/money_management/financial_accounts", {
      limit: 10,
    })) as { data?: Array<{ id?: string; status?: string }> };
    const open = (listed.data ?? []).find((fa) => fa.id && fa.status !== "closed");
    if (open?.id) return { kind: "v2", id: open.id, source: "list" };
  } catch {
    /* account may not have v2 money management */
  }

  // Fall back to Treasury FinancialAccounts (platform or Connect-enabled).
  try {
    const listed = await stripe.treasury.financialAccounts.list({ limit: 10 });
    const open = listed.data.find((fa) => fa.status === "open");
    if (open?.id) return { kind: "treasury", id: open.id, source: "list" };
  } catch {
    /* Treasury not enabled on this account */
  }

  return null;
}

export function fundingSourceCreateParams(source: IssuingCardFundingSource | null) {
  if (!source) return {};
  if (source.kind === "v2") {
    return { financial_account_v2: source.id } as { financial_account_v2: string };
  }
  return { financial_account: source.id };
}

export const MISSING_FINANCIAL_ACCOUNT_MESSAGE =
  "Stripe requires a Financial Account ID to issue cards on this account. " +
  "In Stripe Dashboard find your Issuing / Financial Account ID (starts with fa_ or similar), " +
  "then set STRIPE_ISSUING_FINANCIAL_ACCOUNT_V2 (or STRIPE_ISSUING_FINANCIAL_ACCOUNT) on the CRM " +
  "and redeploy. Contact Stripe Support if you do not see a Financial Account yet.";
