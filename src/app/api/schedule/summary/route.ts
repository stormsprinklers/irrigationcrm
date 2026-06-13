import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getScheduleSummary } from "@/lib/schedule/queries";

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
    const summary = await getScheduleSummary(user.companyId, start, end);
    return NextResponse.json(summary);
  } catch {
    return unauthorizedResponse();
  }
}
