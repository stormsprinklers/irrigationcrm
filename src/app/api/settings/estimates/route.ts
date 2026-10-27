import { NextRequest, NextResponse } from "next/server";
import { DepositType } from "@prisma/client";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { normalizeFinancingUrl } from "@/lib/estimates/financing";
import { prisma } from "@/lib/prisma";

const estimateSettingsSelect = {
  estimateExpiryDays: true,
  estimateDepositRequired: true,
  estimateDepositType: true,
  estimateDepositAmount: true,
  estimateDepositThreshold: true,
  deferredVisitDepositThreshold: true,
  deferredVisitDepositPercent: true,
  estimateWarrantyText: true,
  estimateFinancingUrl: true,
  defaultInstallDurationDays: true,
  supplierEmail: true,
  supplierPartsAutoSend: true,
} as const;

export async function GET() {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: estimateSettingsSelect,
    });
    if (!company) return NextResponse.json(company);
    return NextResponse.json({
      ...company,
      // One threshold controls both customer approval and deferred visit deposits.
      estimateDepositThreshold: company.deferredVisitDepositThreshold,
    });
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
    const sharedDepositThreshold =
      body.deferredVisitDepositThreshold !== undefined
        ? Math.max(0, Number(body.deferredVisitDepositThreshold))
        : body.estimateDepositThreshold !== undefined
          ? Math.max(0, Number(body.estimateDepositThreshold))
          : undefined;
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
        ...(sharedDepositThreshold !== undefined
          ? {
              estimateDepositThreshold: sharedDepositThreshold,
              deferredVisitDepositThreshold: sharedDepositThreshold,
            }
          : {}),
        ...(body.deferredVisitDepositPercent !== undefined
          ? {
              deferredVisitDepositPercent: Math.min(
                100,
                Math.max(0, Number(body.deferredVisitDepositPercent))
              ),
            }
          : {}),
        ...(body.estimateWarrantyText !== undefined
          ? {
              estimateWarrantyText:
                typeof body.estimateWarrantyText === "string"
                  ? body.estimateWarrantyText.trim() || null
                  : null,
            }
          : {}),
        ...(body.estimateFinancingUrl !== undefined
          ? {
              estimateFinancingUrl:
                typeof body.estimateFinancingUrl === "string"
                  ? normalizeFinancingUrl(body.estimateFinancingUrl)
                  : null,
            }
          : {}),
        ...(body.defaultInstallDurationDays !== undefined
          ? { defaultInstallDurationDays: Number(body.defaultInstallDurationDays) }
          : {}),
        ...(body.supplierEmail !== undefined ? { supplierEmail: body.supplierEmail || null } : {}),
        ...(body.supplierPartsAutoSend !== undefined
          ? { supplierPartsAutoSend: Boolean(body.supplierPartsAutoSend) }
          : {}),
      },
      select: estimateSettingsSelect,
    });

    return NextResponse.json(company);
  } catch {
    return unauthorizedResponse();
  }
}
