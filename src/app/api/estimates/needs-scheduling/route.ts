import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { writeStaffAuditLog } from "@/lib/audit/staff-audit";
import { reconcileNeedsSchedulingEstimates } from "@/lib/estimates/scheduling";
import { prisma } from "@/lib/prisma";
import { canManageTeamSchedule } from "@/lib/schedule/time-off";
import { toNumber } from "@/lib/visits/totals";

export async function GET() {
  try {
    const user = await requireSessionUser();
    await reconcileNeedsSchedulingEstimates(user.companyId);
    const estimates = await prisma.estimate.findMany({
      where: { companyId: user.companyId, needsScheduling: true },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        property: { select: { id: true, name: true, address: true, city: true } },
      },
      orderBy: { approvedAt: "desc" },
      take: 25,
    });

    const estimateIds = estimates.map((e) => e.id);
    const visits = estimateIds.length
      ? await prisma.visit.findMany({
          where: { estimateId: { in: estimateIds }, companyId: user.companyId },
          select: { id: true, estimateId: true },
        })
      : [];
    const visitByEstimate = new Map(visits.map((v) => [v.estimateId, v.id]));

    return NextResponse.json({
      estimates: estimates.map((e) => ({
        id: e.id,
        customer: e.customer,
        property: e.property,
        total: toNumber(e.total),
        installDurationDays: e.installDurationDays,
        approvedAt: e.approvedAt?.toISOString() ?? null,
        designProjectId: e.designProjectId,
        visitId: e.visitId ?? visitByEstimate.get(e.id) ?? null,
      })),
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    if (!canManageTeamSchedule(user.role)) return forbiddenResponse();

    const body = await request.json().catch(() => ({}));
    const estimateId = typeof body.estimateId === "string" ? body.estimateId.trim() : "";
    if (!estimateId) return badRequestResponse("estimateId is required");

    const estimate = await prisma.estimate.findFirst({
      where: { id: estimateId, companyId: user.companyId },
      select: {
        id: true,
        customerId: true,
        propertyId: true,
        visitId: true,
        needsScheduling: true,
      },
    });
    if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (estimate.needsScheduling) {
      await prisma.estimate.update({
        where: { id: estimate.id },
        data: { needsScheduling: false },
      });
      await writeStaffAuditLog({
        companyId: user.companyId,
        actorId: user.id,
        entityType: "Estimate",
        entityId: estimate.id,
        action: "needs_scheduling_dismissed",
        field: "needsScheduling",
        before: { needsScheduling: true },
        after: { needsScheduling: false },
        customerId: estimate.customerId,
        propertyId: estimate.propertyId,
        visitId: estimate.visitId,
      });
    }

    return NextResponse.json({ ok: true, estimateId: estimate.id });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Could not update scheduling queue" }, { status: 500 });
  }
}
