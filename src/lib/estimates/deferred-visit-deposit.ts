import { toNumber } from "@/lib/visits/totals";

export type DeferredVisitDepositSettings = {
  deferredVisitDepositThreshold: unknown;
  deferredVisitDepositPercent: unknown;
};

/**
 * Deposit due when scheduling approved estimate work for another day.
 * Default: totals over $1,000 require 50% deposit; at or under threshold → $0.
 */
export function computeDeferredVisitDeposit(
  visitTotal: number,
  settings: DeferredVisitDepositSettings
): {
  depositDue: number;
  threshold: number;
  percent: number;
  required: boolean;
} {
  const threshold = Math.max(0, toNumber(settings.deferredVisitDepositThreshold) || 1000);
  const percent = Math.min(
    100,
    Math.max(0, toNumber(settings.deferredVisitDepositPercent) || 50)
  );
  const total = Math.max(0, visitTotal);
  const required = total > threshold;
  const depositDue = required
    ? Math.round(total * (percent / 100) * 100) / 100
    : 0;
  return { depositDue, threshold, percent, required };
}
