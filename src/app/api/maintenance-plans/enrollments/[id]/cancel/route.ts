import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { computeCancellationFee } from "@/lib/maintenance-plans/discounts";
import { getEnrollment } from "@/lib/maintenance-plans/queries";
import { canManageEnrollments } from "@/lib/maintenance-plans/permissions";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageEnrollments(user.role as UserRole)) return forbiddenResponse();

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
      const { getStripeClient } = await import("@/lib/stripe/client");
      await getStripeClient().subscriptions.cancel(existing.stripeSubscriptionId);
    }

    await prisma.maintenancePlanEnrollment.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: body.cancellationReason ?? null,
        cancellationFeeCharged,
      },
    });

    await prisma.maintenancePlanBillingPeriod.updateMany({
      where: { enrollmentId: id, status: { in: ["PENDING", "DUE"] } },
      data: { status: "CANCELLED" },
    });

    const enrollment = await getEnrollment(user.companyId, id);
    return NextResponse.json(enrollment);
  } catch {
    return unauthorizedResponse();
  }
}
