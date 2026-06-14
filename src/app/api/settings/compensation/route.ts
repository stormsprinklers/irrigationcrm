import { NextRequest, NextResponse } from "next/server";
import type { CommissionBasis, PayPeriodType } from "@prisma/client";
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

export async function GET() {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: user.companyId },
      select: {
        commissionBasis: true,
        payPeriodType: true,
        payPeriodAnchorDate: true,
      },
    });

    return NextResponse.json({
      commissionBasis: company.commissionBasis,
      payPeriodType: company.payPeriodType,
      payPeriodAnchorDate: company.payPeriodAnchorDate?.toISOString() ?? null,
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCompensation(user.role)) return forbiddenResponse();

    const body = await request.json();
    const { commissionBasis, payPeriodType, payPeriodAnchorDate } = body;

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
      },
      select: {
        commissionBasis: true,
        payPeriodType: true,
        payPeriodAnchorDate: true,
      },
    });

    return NextResponse.json({
      commissionBasis: company.commissionBasis,
      payPeriodType: company.payPeriodType,
      payPeriodAnchorDate: company.payPeriodAnchorDate?.toISOString() ?? null,
    });
  } catch {
    return unauthorizedResponse();
  }
}
