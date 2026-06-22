import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { fetchRachioEvents } from "@/lib/rachio/property";
import { RachioApiError } from "@/lib/rachio/types";

type Params = { params: Promise<{ id: string; propertyId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id: customerId, propertyId } = await params;
    const days = Math.min(
      90,
      Math.max(1, parseInt(request.nextUrl.searchParams.get("days") ?? "30", 10) || 30)
    );

    const events = await fetchRachioEvents(user.companyId, customerId, propertyId, days);
    return NextResponse.json({ events, days });
  } catch (error) {
    if (error instanceof RachioApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return unauthorizedResponse();
  }
}
