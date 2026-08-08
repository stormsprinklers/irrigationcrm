import { NextRequest, NextResponse } from "next/server";
import {
  requirePortalCustomer,
  portalUnauthorizedResponse,
  portalForbiddenResponse,
  portalNotFoundResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import {
  cancelMaintenanceEnrollment,
  previewEnrollmentCancellation,
} from "@/lib/maintenance-plans/cancel-enrollment";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();
  if (!portalFeatureEnabled(ctx.company, "maintenance")) {
    return portalForbiddenResponse("Maintenance plans are not available in the portal");
  }

  const { id } = await params;
  const preview = await previewEnrollmentCancellation({
    companyId: ctx.companyId,
    enrollmentId: id,
    customerId: ctx.customerId,
  });
  if (!preview) return portalNotFoundResponse();

  return NextResponse.json(preview);
}

export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();
  if (!portalFeatureEnabled(ctx.company, "maintenance")) {
    return portalForbiddenResponse("Maintenance plans are not available in the portal");
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const result = await cancelMaintenanceEnrollment({
    companyId: ctx.companyId,
    enrollmentId: id,
    customerId: ctx.customerId,
    cancellationReason:
      typeof body.cancellationReason === "string" ? body.cancellationReason : "Cancelled by customer",
    requireOutstandingBalancePaid: true,
    requireFeeChargeSuccess: true,
  });

  if (!result.ok) {
    const status =
      result.code === "NOT_FOUND"
        ? 404
        : result.code === "CARD_REQUIRED" || result.code === "FEE_CHARGE_FAILED"
          ? 402
          : 400;
    return NextResponse.json(
      {
        error: result.error,
        code: result.code,
        balanceDue: result.balanceDue,
        cancellationFee: result.cancellationFee,
      },
      { status }
    );
  }

  return NextResponse.json({
    ok: true,
    cancellationFeeCharged: result.cancellationFeeCharged,
    cancellationFeePaymentIntentId: result.cancellationFeePaymentIntentId,
  });
}
