import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { computeCancellationFee, recordMaintenanceInvoicePayment } from "@/lib/maintenance-plans/discounts";
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
      include: {
        template: true,
        customer: true,
        billingPeriods: {
          where: { status: "PAID" },
          select: { periodStart: true, amount: true, status: true },
        },
      },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.status === "CANCELLED") return badRequestResponse("Enrollment is already cancelled");
    if (existing.status === "DRAFT") return badRequestResponse("Draft enrollments cannot be cancelled");

    const body = await request.json().catch(() => ({}));
    const basePrice = toNumber(existing.template.basePrice);
    const cancellationFeeCharged = computeCancellationFee({
      basePrice,
      feeType: existing.template.cancellationFeeType,
      feeAmount:
        existing.template.cancellationFeeAmount != null
          ? toNumber(existing.template.cancellationFeeAmount)
          : null,
      startDate: existing.startDate,
      paidPeriods: existing.billingPeriods.map((p) => ({
        periodStart: p.periodStart,
        amount: toNumber(p.amount),
      })),
    });

    let cancellationFeePaymentIntentId: string | null = null;
    let cancellationFeeChargeError: string | null = null;

    if (cancellationFeeCharged > 0 && process.env.STRIPE_SECRET_KEY) {
      const stripeCustomerId =
        existing.stripeCustomerId ?? existing.customer.stripeCustomerId ?? null;
      const paymentMethodId = existing.stripePaymentMethodId;

      if (stripeCustomerId && paymentMethodId) {
        try {
          const { getStripeClient } = await import("@/lib/stripe/client");
          const stripe = getStripeClient();
          const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(cancellationFeeCharged * 100),
            currency: "usd",
            customer: stripeCustomerId,
            payment_method: paymentMethodId,
            off_session: true,
            confirm: true,
            metadata: {
              enrollmentId: existing.id,
              companyId: user.companyId,
              purpose: "maintenance_cancellation_fee",
              feeType: existing.template.cancellationFeeType,
            },
          });

          if (paymentIntent.status === "succeeded") {
            cancellationFeePaymentIntentId = paymentIntent.id;
            const feePeriod = await prisma.maintenancePlanBillingPeriod.create({
              data: {
                enrollmentId: id,
                periodStart: new Date(),
                periodEnd: new Date(),
                amount: cancellationFeeCharged,
                status: "DUE",
                dueDate: new Date(),
              },
            });
            await recordMaintenanceInvoicePayment({
              companyId: user.companyId,
              customerId: existing.customerId,
              enrollmentId: id,
              billingPeriodId: feePeriod.id,
              amount: cancellationFeeCharged,
              stripePaymentIntentId: paymentIntent.id,
            });
            // Relabel the invoice line for clarity
            const period = await prisma.maintenancePlanBillingPeriod.findUnique({
              where: { id: feePeriod.id },
              select: { invoiceId: true },
            });
            if (period?.invoiceId) {
              await prisma.invoiceLineItem.updateMany({
                where: { invoiceId: period.invoiceId },
                data: { name: "Maintenance plan cancellation fee" },
              });
            }
          } else {
            cancellationFeeChargeError = `Payment status: ${paymentIntent.status}`;
          }
        } catch (chargeError) {
          console.error("Cancellation fee charge failed:", chargeError);
          cancellationFeeChargeError =
            chargeError instanceof Error ? chargeError.message : "Failed to charge cancellation fee";
        }
      } else {
        cancellationFeeChargeError =
          "No card on file — cancellation fee was calculated but not charged";
      }
    }

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

    return NextResponse.json({
      ...enrollment,
      cancellationFeeCharged,
      cancellationFeePaymentIntentId,
      cancellationFeeChargeError,
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
