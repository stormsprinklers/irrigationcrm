import { NextResponse } from "next/server";
import { VisitStatus } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { serializeVisitDetail, visitDetailInclude } from "@/lib/visits/queries";

const ACTIVE_STATUSES: VisitStatus[] = [
  VisitStatus.EN_ROUTE,
  VisitStatus.IN_PROGRESS,
  VisitStatus.PAUSED,
];

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser(request);
    const visit = await prisma.visit.findFirst({
      where: {
        companyId: user.companyId,
        assignedUserId: user.id,
        status: { in: ACTIVE_STATUSES },
      },
      orderBy: { updatedAt: "desc" },
      include: visitDetailInclude,
    });

    if (!visit) {
      return NextResponse.json({ visit: null });
    }

    return NextResponse.json({ visit: await serializeVisitDetail(visit) });
  } catch {
    return unauthorizedResponse();
  }
}
