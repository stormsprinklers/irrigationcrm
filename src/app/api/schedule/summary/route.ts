import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getScheduleSummary } from "@/lib/schedule/queries";
import type { ScheduleFilters } from "@/lib/schedule/types";

function parseFilters(searchParams: URLSearchParams): ScheduleFilters {
  return {
    serviceAreaIds: searchParams.getAll("serviceAreaIds").filter(Boolean),
    userIds: searchParams.getAll("userIds").filter(Boolean),
    crewIds: searchParams.getAll("crewIds").filter(Boolean),
    divisions: searchParams.getAll("divisions").filter(Boolean) as ("INSTALL" | "SERVICE")[],
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = request.nextUrl;
    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");

    if (!startParam || !endParam) {
      return badRequestResponse("start and end query params are required");
    }

    const start = new Date(startParam);
    const end = new Date(endParam);
    let extraWhere;
    const { isFieldRole } = await import("@/lib/employees");
    if (isFieldRole(user.role)) {
      const { fieldVisitAssigneeWhere } = await import("@/lib/field/access");
      extraWhere = await fieldVisitAssigneeWhere(user.companyId, user.id);
    }
    const summary = await getScheduleSummary(
      user.companyId,
      start,
      end,
      parseFilters(searchParams),
      extraWhere
    );
    return NextResponse.json(summary);
  } catch {
    return unauthorizedResponse();
  }
}
