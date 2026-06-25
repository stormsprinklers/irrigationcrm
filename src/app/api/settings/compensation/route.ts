import { NextRequest, NextResponse } from "next/server";
import type { CommissionBasis, PayPeriodType, PayType } from "@prisma/client";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canManageCompensation } from "@/lib/timesheets/permissions";
import { prisma } from "@/lib/prisma";

const COMMISSION_BASIS_VALUES: CommissionBasis[] = [
  "COMPLETED_JOB_REVENUE",
  "COLLECTED_INVOICE",
  "GROSS_PROFIT",
  "LABOR_ONLY",
];

const PAY_PERIOD_VALUES: PayPeriodType[] = ["WEEKLY", "BIWEEKLY", "MONTHLY"];
const PAY_TYPE_VALUES: PayType[] = ["HOURLY", "COMMISSION", "HYBRID", "SALARY"];

const companySelect = {
  commissionBasis: true,
  payPeriodType: true,
  payPeriodAnchorDate: true,
  defaultTechnicianPayType: true,
  defaultTechnicianHourlyRate: true,
  defaultTechnicianCommissionPercent: true,
  overtimeWeeklyThresholdHours: true,
  overtimeRateMultiplier: true,
} as const;

function serializeCompanyPay(company: {
  commissionBasis: CommissionBasis;
  payPeriodType: PayPeriodType;
  payPeriodAnchorDate: Date | null;
  defaultTechnicianPayType: PayType;
  defaultTechnicianHourlyRate: unknown;
  defaultTechnicianCommissionPercent: unknown;
  overtimeWeeklyThresholdHours: unknown;
  overtimeRateMultiplier: unknown;
}) {
  return {
    commissionBasis: company.commissionBasis,
    payPeriodType: company.payPeriodType,
    payPeriodAnchorDate: company.payPeriodAnchorDate?.toISOString() ?? null,
    defaultTechnicianPayType: company.defaultTechnicianPayType,
    defaultTechnicianHourlyRate: Number(company.defaultTechnicianHourlyRate),
    defaultTechnicianCommissionPercent: Number(company.defaultTechnicianCommissionPercent),
    overtimeWeeklyThresholdHours: Number(company.overtimeWeeklyThresholdHours),
    overtimeRateMultiplier: Number(company.overtimeRateMultiplier),
  };
}

export async function GET() {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: user.companyId },
      select: companySelect,
    });

    return NextResponse.json(serializeCompanyPay(company));
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCompensation(user.role)) return forbiddenResponse();

    const body = await request.json();
    const {
      commissionBasis,
      payPeriodType,
      payPeriodAnchorDate,
      defaultTechnicianPayType,
      defaultTechnicianHourlyRate,
      defaultTechnicianCommissionPercent,
      overtimeWeeklyThresholdHours,
      overtimeRateMultiplier,
    } = body;

    const company = await prisma.company.update({
      where: { id: user.companyId },
      data: {
        ...(commissionBasis !== undefined && COMMISSION_BASIS_VALUES.includes(commissionBasis)
          ? { commissionBasis }
          : {}),
        ...(payPeriodType !== undefined && PAY_PERIOD_VALUES.includes(payPeriodType)
          ? { payPeriodType }
          : {}),
        ...(payPeriodAnchorDate !== undefined
          ? {
              payPeriodAnchorDate: payPeriodAnchorDate
                ? new Date(payPeriodAnchorDate)
                : null,
            }
          : {}),
        ...(defaultTechnicianPayType !== undefined &&
        PAY_TYPE_VALUES.includes(defaultTechnicianPayType)
          ? { defaultTechnicianPayType }
          : {}),
        ...(defaultTechnicianHourlyRate !== undefined
          ? { defaultTechnicianHourlyRate: Number(defaultTechnicianHourlyRate) }
          : {}),
        ...(defaultTechnicianCommissionPercent !== undefined
          ? { defaultTechnicianCommissionPercent: Number(defaultTechnicianCommissionPercent) }
          : {}),
        ...(overtimeWeeklyThresholdHours !== undefined
          ? { overtimeWeeklyThresholdHours: Number(overtimeWeeklyThresholdHours) }
          : {}),
        ...(overtimeRateMultiplier !== undefined
          ? { overtimeRateMultiplier: Number(overtimeRateMultiplier) }
          : {}),
      },
      select: companySelect,
    });

    return NextResponse.json(serializeCompanyPay(company));
  } catch {
    return unauthorizedResponse();
  }
}
