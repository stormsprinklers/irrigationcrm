import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";

export async function GET() {
  try {
    const user = await requireSessionUser();
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
        visitId: visitByEstimate.get(e.id) ?? null,
      })),
    });
  } catch {
    return unauthorizedResponse();
  }
}
