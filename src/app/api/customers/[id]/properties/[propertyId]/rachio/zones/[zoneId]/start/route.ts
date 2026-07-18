import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { isFieldRole } from "@/lib/employees";
import { canAccessPropertyAsField } from "@/lib/field/property-access";
import { runRachioZone } from "@/lib/rachio/property";
import { RachioApiError } from "@/lib/rachio/types";

type Params = { params: Promise<{ id: string; propertyId: string; zoneId: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id: customerId, propertyId, zoneId } = await params;

    if (isFieldRole(user.role)) {
      const allowed = await canAccessPropertyAsField(user, customerId, propertyId);
      if (!allowed) return forbiddenResponse("No access to this property");
    }

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
