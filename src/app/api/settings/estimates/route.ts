import { NextRequest, NextResponse } from "next/server";
import { DepositType } from "@prisma/client";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        estimateExpiryDays: true,
        estimateDepositRequired: true,
        estimateDepositType: true,
        estimateDepositAmount: true,
        defaultInstallDurationDays: true,
        supplierEmail: true,
        supplierPartsAutoSend: true,
      },
    });
    return NextResponse.json(company);
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return forbiddenResponse();
    }

    const body = await request.json();
    const company = await prisma.company.update({
      where: { id: user.companyId },
      data: {
        ...(body.estimateExpiryDays !== undefined
          ? { estimateExpiryDays: Number(body.estimateExpiryDays) }
          : {}),
        ...(body.estimateDepositRequired !== undefined
          ? { estimateDepositRequired: Boolean(body.estimateDepositRequired) }
          : {}),
        ...(body.estimateDepositType !== undefined
          ? { estimateDepositType: body.estimateDepositType as DepositType | null }
          : {}),
        ...(body.estimateDepositAmount !== undefined
          ? { estimateDepositAmount: body.estimateDepositAmount ?? null }
          : {}),
        ...(body.defaultInstallDurationDays !== undefined
          ? { defaultInstallDurationDays: Number(body.defaultInstallDurationDays) }
          : {}),
        ...(body.supplierEmail !== undefined ? { supplierEmail: body.supplierEmail || null } : {}),
        ...(body.supplierPartsAutoSend !== undefined
          ? { supplierPartsAutoSend: Boolean(body.supplierPartsAutoSend) }
          : {}),
      },
      select: {
        estimateExpiryDays: true,
        estimateDepositRequired: true,
        estimateDepositType: true,
        estimateDepositAmount: true,
        defaultInstallDurationDays: true,
        supplierEmail: true,
        supplierPartsAutoSend: true,
      },
    });

    return NextResponse.json(company);
  } catch {
    return unauthorizedResponse();
  }
}
