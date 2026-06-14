import type { PayType } from "@prisma/client";
import { toNumber } from "@/lib/visits/totals";

export type UserPayFields = {
  payType: PayType | null;
  hourlyRate: unknown;
  commissionPercent: unknown;
  annualSalary: unknown;
};

const SALARY_HOURS_PER_YEAR = 2080;

export function effectiveHourlyCost(user: UserPayFields): number | null {
  if (!user.payType) return null;

  if (user.payType === "SALARY") {
    if (user.annualSalary == null) return null;
    return toNumber(user.annualSalary) / SALARY_HOURS_PER_YEAR;
  }

  if (user.hourlyRate != null) {
    return toNumber(user.hourlyRate);
  }

  return null;
}

export function computeCommissionAmount(basisAmount: number, percent: number) {
  return Math.round((basisAmount * percent) / 100 * 100) / 100;
}

export function usesCommissionPay(payType: PayType | null) {
  return payType === "COMMISSION" || payType === "HYBRID";
}

export function usesHourlyPay(payType: PayType | null) {
  return payType === "HOURLY" || payType === "HYBRID";
}
