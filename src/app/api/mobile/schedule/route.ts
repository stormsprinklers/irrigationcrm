import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { isFieldRole } from "@/lib/employees";
import { listVisits } from "@/lib/visits/queries";

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
    const scopedToAssignee = isFieldRole(user.role);
    const jobs = await listVisits(user.companyId, start, end, {
      serviceAreaIds: [],
      crewIds: [],
      divisions: [],
      userIds: scopedToAssignee ? [user.id] : [],
    });

    return NextResponse.json(jobs);
  } catch {
    return unauthorizedResponse();
  }
}
