import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  refreshPortInFromTwilio,
  serializePortIn,
} from "@/lib/twilio/port-in-service";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: Ctx) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const refreshed = await refreshPortInFromTwilio(user.companyId, id);
    if (!refreshed) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(serializePortIn(refreshed));
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message =
      error instanceof Error ? error.message : "Failed to refresh port status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
