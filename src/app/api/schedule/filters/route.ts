import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getScheduleFilters } from "@/lib/schedule/queries";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const filters = await getScheduleFilters(user.companyId);
    return NextResponse.json(filters);
  } catch {
    return unauthorizedResponse();
  }
}
