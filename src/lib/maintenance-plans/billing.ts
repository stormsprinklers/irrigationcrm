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
