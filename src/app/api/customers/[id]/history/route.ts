import { NextRequest, NextResponse } from "next/server";
import { VisitStatus } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id: customerId } = await params;
    const excludeVisitId = request.nextUrl.searchParams.get("excludeVisitId");

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, companyId: user.companyId },
      select: { id: true },
    });
    if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [visits, estimates] = await Promise.all([
      prisma.visit.findMany({
        where: {
          companyId: user.companyId,
          customerId,
          status: { not: VisitStatus.CANCELLED },
          ...(excludeVisitId ? { id: { not: excludeVisitId } } : {}),
        },
        select: {
          id: true,
          title: true,
          startAt: true,
          status: true,
          assignedUser: { select: { id: true, name: true } },
        },
        orderBy: { startAt: "desc" },
        take: 50,
      }),
      prisma.estimate.findMany({
        where: { companyId: user.companyId, customerId },
        select: {
          id: true,
          status: true,
          total: true,
          visitId: true,
          createdAt: true,
          visit: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    const pastVisitCount = visits.length;
    const estimatesWithoutVisit = estimates.filter((row) => !row.visitId);
    const estimatesLinkedToVisits = estimates.filter((row) => row.visitId);

    return NextResponse.json({
      pastVisitCount,
      visits: visits.map((row) => ({
        id: row.id,
        title: row.title,
        startAt: row.startAt.toISOString(),
        status: row.status,
        assignedUserName: row.assignedUser?.name ?? null,
      })),
      estimatesWithoutVisit: estimatesWithoutVisit.map((row) => ({
        id: row.id,
        status: row.status,
        total: row.total,
        createdAt: row.createdAt.toISOString(),
      })),
      estimatesLinkedToVisits: estimatesLinkedToVisits.map((row) => ({
        id: row.id,
        status: row.status,
        total: row.total,
        createdAt: row.createdAt.toISOString(),
        visitId: row.visitId,
        visitTitle: row.visit?.title ?? null,
      })),
    });
  } catch {
    return unauthorizedResponse();
  }
}
