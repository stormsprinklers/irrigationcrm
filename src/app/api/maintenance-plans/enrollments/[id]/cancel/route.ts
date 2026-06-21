import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { computeCancellationFee } from "@/lib/maintenance-plans/discounts";
import { getEnrollment } from "@/lib/maintenance-plans/queries";
import { canManageEnrollments } from "@/lib/maintenance-plans/permissions";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageEnrollments(user.role as UserRole)) {
      return forbiddenResponse("You do not have permission to cancel enrollments");
    }

    const { id } = await params;
    const existing = await prisma.maintenancePlanEnrollment.findFirst({
      where: { id, companyId: user.companyId },
      include: { template: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.status === "CANCELLED") return badRequestResponse("Enrollment is already cancelled");
    if (existing.status === "DRAFT") return badRequestResponse("Draft enrollments cannot be cancelled");

    const body = await request.json().catch(() => ({}));
    const basePrice = toNumber(existing.template.basePrice);
    const cancellationFeeCharged = computeCancellationFee(
      basePrice,
      existing.template.cancellationFeeType,
      existing.template.cancellationFeeAmount != null
        ? toNumber(existing.template.cancellationFeeAmount)
        : null
    );

    if (existing.stripeSubscriptionId && process.env.STRIPE_SECRET_KEY) {
      try {
        const { getStripeClient } = await import("@/lib/stripe/client");
        await getStripeClient().subscriptions.cancel(existing.stripeSubscriptionId);
      } catch (stripeError) {
        console.error("Stripe subscription cancel failed:", stripeError);
        // Continue cancelling locally even if Stripe is already cancelled or misconfigured.
      }
    }

    await prisma.maintenancePlanEnrollment.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason:
          typeof body.cancellationReason === "string" && body.cancellationReason.trim()
            ? body.cancellationReason.trim()
            : null,
        cancellationFeeCharged,
        autoRenew: false,
      },
    });

    await prisma.maintenancePlanBillingPeriod.updateMany({
      where: { enrollmentId: id, status: { in: ["PENDING", "DUE"] } },
      data: { status: "CANCELLED" },
    });

    await prisma.maintenancePlanVisit.updateMany({
      where: {
        enrollmentId: id,
        status: { in: ["UNSCHEDULED", "OVERDUE"] },
      },
      data: { status: "SKIPPED" },
    });

    const enrollment = await getEnrollment(user.companyId, id);
    if (!enrollment) {
      return NextResponse.json({ error: "Enrollment not found after cancellation" }, { status: 500 });
    }

    return NextResponse.json(enrollment);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Cancel enrollment failed:", error);
    const message = error instanceof Error ? error.message : "Failed to cancel enrollment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
