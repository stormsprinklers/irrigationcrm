import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { cancelMaintenanceEnrollment } from "@/lib/maintenance-plans/cancel-enrollment";
import { getEnrollment } from "@/lib/maintenance-plans/queries";
import { canManageEnrollments } from "@/lib/maintenance-plans/permissions";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageEnrollments(user.role as UserRole)) {
      return forbiddenResponse("You do not have permission to cancel enrollments");
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const result = await cancelMaintenanceEnrollment({
      companyId: user.companyId,
      enrollmentId: id,
      cancellationReason:
        typeof body.cancellationReason === "string" ? body.cancellationReason : null,
      requireOutstandingBalancePaid: false,
      requireFeeChargeSuccess: false,
    });

    if (!result.ok) {
      if (result.code === "NOT_FOUND") {
        return NextResponse.json({ error: result.error }, { status: 404 });
      }
      return badRequestResponse(result.error);
    }

    const enrollment = await getEnrollment(user.companyId, id);
    if (!enrollment) {
      return NextResponse.json({ error: "Enrollment not found after cancellation" }, { status: 500 });
    }

    return NextResponse.json({
      ...enrollment,
      cancellationFeeCharged: result.cancellationFeeCharged,
      cancellationFeePaymentIntentId: result.cancellationFeePaymentIntentId,
      cancellationFeeChargeError: result.cancellationFeeChargeError,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Cancel enrollment failed:", error);
    const message = error instanceof Error ? error.message : "Failed to cancel enrollment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
