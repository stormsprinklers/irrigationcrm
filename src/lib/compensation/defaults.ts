import type { PayType, UserRole } from "@prisma/client";
import { toNumber } from "@/lib/visits/totals";

export type TechnicianPayDefaults = {
  payType: PayType;
  hourlyRate: number;
  commissionPercent: number;
};

export type OvertimeSettings = {
  weeklyThresholdHours: number;
  rateMultiplier: number;
};

export type CompanyPayDefaults = {
  defaultTechnicianPayType: PayType | null;
  defaultTechnicianHourlyRate: unknown;
  defaultTechnicianCommissionPercent: unknown;
  overtimeWeeklyThresholdHours: unknown;
  overtimeRateMultiplier: unknown;
};

export function getTechnicianPayDefaults(company: CompanyPayDefaults): TechnicianPayDefaults {
  return {
    payType: company.defaultTechnicianPayType ?? "HYBRID",
    hourlyRate: toNumber(company.defaultTechnicianHourlyRate ?? 25),
    commissionPercent: toNumber(company.defaultTechnicianCommissionPercent ?? 20),
  };
}

export function getOvertimeSettings(company: CompanyPayDefaults): OvertimeSettings {
  return {
    weeklyThresholdHours: toNumber(company.overtimeWeeklyThresholdHours ?? 40),
    rateMultiplier: toNumber(company.overtimeRateMultiplier ?? 1.5),
  };
}

export function resolveCreateEmployeePay(
  role: UserRole,
  body: {
    payType?: string | null;
    hourlyRate?: number | null;
    commissionPercent?: number | null;
  },
  company: CompanyPayDefaults
): {
  payType: PayType | null;
  hourlyRate: number | null;
  commissionPercent: number | null;
} {
  if (body.payType) {
    return {
      payType: body.payType as PayType,
      hourlyRate: body.hourlyRate != null ? Number(body.hourlyRate) : null,
      commissionPercent: body.commissionPercent != null ? Number(body.commissionPercent) : null,
    };
  }

  if (role === "TECH") {
    const defaults = getTechnicianPayDefaults(company);
    return {
      payType: defaults.payType,
      hourlyRate: defaults.hourlyRate,
      commissionPercent: defaults.commissionPercent,
    };
  }

  return { payType: null, hourlyRate: null, commissionPercent: null };
}
