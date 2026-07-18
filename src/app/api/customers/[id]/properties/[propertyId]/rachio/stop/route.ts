import { NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { isFieldRole } from "@/lib/employees";
import { canAccessPropertyAsField } from "@/lib/field/property-access";
import { stopRachioWatering } from "@/lib/rachio/property";
import { RachioApiError } from "@/lib/rachio/types";

type Params = { params: Promise<{ id: string; propertyId: string }> };

export async function PUT(_request: Request, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id: customerId, propertyId } = await params;

    if (isFieldRole(user.role)) {
      const allowed = await canAccessPropertyAsField(user, customerId, propertyId);
      if (!allowed) return forbiddenResponse("No access to this property");
    }

    await stopRachioWatering(user.companyId, customerId, propertyId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RachioApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return unauthorizedResponse();
  }
}
