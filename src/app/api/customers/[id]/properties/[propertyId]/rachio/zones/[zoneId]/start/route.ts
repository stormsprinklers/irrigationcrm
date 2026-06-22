import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { runRachioZone } from "@/lib/rachio/property";
import { RachioApiError } from "@/lib/rachio/types";

type Params = { params: Promise<{ id: string; propertyId: string; zoneId: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (user.role === "TECH") return forbiddenResponse();

    const { id: customerId, propertyId, zoneId } = await params;
    const body = await request.json();
    const durationMinutes = Number(body.durationMinutes ?? body.duration ?? 5);

    if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 180) {
      return badRequestResponse("durationMinutes must be between 1 and 180");
    }

    const result = await runRachioZone(
      user.companyId,
      customerId,
      propertyId,
      zoneId,
      durationMinutes
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof RachioApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return unauthorizedResponse();
  }
}
