import { NextRequest, NextResponse } from "next/server";
import { DepositType, EstimateStatus } from "@prisma/client";
import { forbiddenForFieldRole, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getEstimateForCompany } from "@/lib/estimates/queries";
import { onEstimateClosed, onEstimateSent, onEstimateStatusChange } from "@/lib/notifications/estimate-followup";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const estimate = await getEstimateForCompany(user.companyId, id);
    if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(estimate);
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();

    const { id } = await params;
    const existing = await prisma.estimate.findFirst({ where: { id, companyId: user.companyId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const newStatus = body.status !== undefined ? (body.status as EstimateStatus) : undefined;
    await prisma.estimate.update({
      where: { id },
      data: {
        ...(newStatus !== undefined ? { status: newStatus } : {}),
        ...(body.propertyId !== undefined ? { propertyId: body.propertyId ?? null } : {}),
        ...(body.visitId !== undefined ? { visitId: body.visitId ?? null } : {}),
        ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null } : {}),
        ...(body.depositRequired !== undefined ? { depositRequired: Boolean(body.depositRequired) } : {}),
        ...(body.depositType !== undefined ? { depositType: body.depositType as DepositType | null } : {}),
        ...(body.depositAmount !== undefined ? { depositAmount: body.depositAmount ?? null } : {}),
        ...(body.installDurationDays !== undefined
          ? { installDurationDays: Math.max(1, Number(body.installDurationDays) || 4) }
          : {}),
        ...(newStatus === EstimateStatus.APPROVED ? { approvedAt: new Date() } : {}),
      },
    });

    if (newStatus !== undefined && newStatus !== existing.status) {
      void onEstimateStatusChange(id, newStatus).catch(() => {});
      if (newStatus === EstimateStatus.SENT) {
        void onEstimateSent(id, user.companyId).catch(() => {});
      }
    }

    if (body.installDurationDays !== undefined) {
      await prisma.visit.updateMany({
        where: { estimateId: id, companyId: user.companyId },
        data: { installDurationDays: Math.max(1, Number(body.installDurationDays) || 4) },
      });
    }

    const estimate = await getEstimateForCompany(user.companyId, id);
    return NextResponse.json(estimate);
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const fieldDenied = forbiddenForFieldRole(user.role); if (fieldDenied) return fieldDenied;

    const { id } = await params;
    const result = await prisma.estimate.deleteMany({ where: { id, companyId: user.companyId } });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    void onEstimateClosed(id).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
