import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { isFieldRole } from "@/lib/employees";
import { fieldVisitAssigneeWhere } from "@/lib/field/access";
import { prisma } from "@/lib/prisma";
import { listVisits, serializeVisit, visitInclude } from "@/lib/visits/queries";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    const { searchParams } = request.nextUrl;
    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");
    if (!startParam || !endParam) {
      return badRequestResponse("start and end query params are required");
    }

    const start = new Date(startParam);
    const end = new Date(endParam);

    if (isFieldRole(user.role)) {
      const assigneeWhere = await fieldVisitAssigneeWhere(user.companyId, user.id);
      const visits = await prisma.visit.findMany({
        where: {
          ...assigneeWhere,
          status: { not: "CANCELLED" },
          startAt: { lt: end },
          endAt: { gt: start },
        },
        include: visitInclude,
        orderBy: { startAt: "asc" },
      });
      return NextResponse.json(visits.map(serializeVisit));
    }

    const jobs = await listVisits(user.companyId, start, end, {
      serviceAreaIds: [],
      crewIds: [],
      divisions: [],
      userIds: [],
    });

    return NextResponse.json(jobs);
  } catch {
    return unauthorizedResponse();
  }
}
