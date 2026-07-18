import { NextResponse } from "next/server";
import { VisitStatus } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { fieldVisitAssigneeWhere } from "@/lib/field/access";
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
    const assigneeWhere = await fieldVisitAssigneeWhere(user.companyId, user.id);
    const visit = await prisma.visit.findFirst({
      where: {
        ...assigneeWhere,
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
