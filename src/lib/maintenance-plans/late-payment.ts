import type { BillingPeriodStatus } from "@prisma/client";
import type { BillingPeriodDTO, EnrollmentDTO } from "@/lib/maintenance-plans/types";

type BillingLateInput = {
  status: BillingPeriodStatus | string;
  dueDate: string | Date;
  paidAt?: string | Date | null;
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Unpaid billing that failed or is past its due date. */
export function isBillingPeriodLate(period: BillingLateInput): boolean {
  if (period.paidAt) return false;
  const status = String(period.status);
  if (status === "PAID" || status === "CANCELLED" || status === "WAIVED") return false;
  if (status === "FAILED") return true;

  if (status === "DUE" || status === "PENDING") {
    const due = new Date(period.dueDate);
    if (Number.isNaN(due.getTime())) return false;
    return due < startOfToday();
  }

  return false;
}

export function lateBillingPeriods(periods: BillingPeriodDTO[] | null | undefined) {
  return (periods ?? []).filter((period) => isBillingPeriodLate(period));
}

export function enrollmentHasLatePayment(enrollment: Pick<EnrollmentDTO, "billingPeriods">) {
  return lateBillingPeriods(enrollment.billingPeriods).length > 0;
}

export function latePaymentSummary(periods: BillingPeriodDTO[]) {
  const late = lateBillingPeriods(periods);
  const total = late.reduce((sum, period) => sum + period.amount, 0);
  return { count: late.length, total, periods: late };
}
