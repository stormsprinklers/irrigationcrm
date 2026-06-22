import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { fetchRachioSchedules } from "@/lib/rachio/property";
import { RachioApiError } from "@/lib/rachio/types";

type Params = { params: Promise<{ id: string; propertyId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id: customerId, propertyId } = await params;
    const schedules = await fetchRachioSchedules(user.companyId, customerId, propertyId);
    return NextResponse.json(schedules);
  } catch (error) {
    if (error instanceof RachioApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return unauthorizedResponse();
  }
}
