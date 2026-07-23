import type { BillingFrequency } from "@prisma/client";

export function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function addYears(date: Date, years: number) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

export function frequencyMonths(frequency: BillingFrequency): number {
  switch (frequency) {
    case "MONTHLY":
      return 1;
    case "QUARTERLY":
      return 3;
    case "ANNUAL":
      return 12;
    case "MULTI_YEAR_UPFRONT":
      return 12;
    default:
      return 12;
  }
}

export function computePeriodAmount(basePrice: number, frequency: BillingFrequency, durationYears?: number | null) {
  switch (frequency) {
    case "MONTHLY":
      return basePrice / 12;
    case "QUARTERLY":
      return basePrice / 4;
    case "ANNUAL":
      return basePrice;
    case "MULTI_YEAR_UPFRONT":
      return basePrice * (durationYears ?? 1);
    default:
      return basePrice;
  }
}

export function computeNextBillingDate(from: Date, frequency: BillingFrequency) {
  return addMonths(from, frequencyMonths(frequency));
}

export function computeEnrollmentEndDate(
  startDate: Date,
  durationType: "FIXED_TERM" | "UNTIL_CANCELLED",
  durationYears: number | null,
  billingFrequency: BillingFrequency
) {
  if (durationType === "UNTIL_CANCELLED") return null;
  const years = durationYears ?? 1;
  if (billingFrequency === "MULTI_YEAR_UPFRONT") {
    return addYears(startDate, years);
  }
  return addYears(startDate, years);
}

export function monthlyRecurringAmount(basePrice: number, frequency: BillingFrequency, durationYears?: number | null) {
  const period = computePeriodAmount(basePrice, frequency, durationYears);
  const months = frequencyMonths(frequency);
  return period / months;
}

/** Start of the plan-year window that contains `asOf` (aligned to enrollment startDate). */
export function currentPlanYearStart(startDate: Date, asOf: Date = new Date()) {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  let yearStart = start;
  while (addYears(yearStart, 1).getTime() <= asOf.getTime()) {
    yearStart = addYears(yearStart, 1);
  }
  return yearStart;
}

/**
 * Remainder of the current plan year's balance: annual list price minus amounts
 * already PAID in that plan year. Monthly/quarterly cancel → unpaid months/quarters.
 * Annual prepaid → typically $0.
 */
export function computeRemainderOfYearCancellationFee(params: {
  basePrice: number;
  startDate: Date;
  asOf?: Date;
  paidPeriods: Array<{ periodStart: Date; amount: number }>;
}) {
  const annual = Math.max(0, params.basePrice);
  if (annual <= 0) return 0;

  const asOf = params.asOf ?? new Date();
  const yearStart = currentPlanYearStart(params.startDate, asOf);
  const yearEnd = addYears(yearStart, 1);

  const paidInYear = params.paidPeriods
    .filter((p) => {
      const t = p.periodStart.getTime();
      return t >= yearStart.getTime() && t < yearEnd.getTime();
    })
    .reduce((sum, p) => sum + p.amount, 0);

  return Math.max(0, Math.round((annual - paidInYear) * 100) / 100);
}

export function computeCancellationFee(params: {
  basePrice: number;
  feeType: "NONE" | "FIXED" | "PERCENT" | "REMAINDER_OF_YEAR" | string;
  feeAmount: number | null;
  startDate?: Date;
  paidPeriods?: Array<{ periodStart: Date; amount: number }>;
}) {
  const { feeType, feeAmount, basePrice } = params;
  if (feeType === "NONE") return 0;
  if (feeType === "REMAINDER_OF_YEAR") {
    if (!params.startDate) return 0;
    return computeRemainderOfYearCancellationFee({
      basePrice,
      startDate: params.startDate,
      paidPeriods: params.paidPeriods ?? [],
    });
  }
  if (feeAmount == null) return 0;
  if (feeType === "FIXED") return feeAmount;
  if (feeType === "PERCENT") {
    return Math.round(basePrice * (feeAmount / 100) * 100) / 100;
  }
  return 0;
}
