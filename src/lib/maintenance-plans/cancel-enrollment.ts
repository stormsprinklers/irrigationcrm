import { computeCancellationFee, recordMaintenanceInvoicePayment } from "@/lib/maintenance-plans/discounts";
import { isBillingPeriodLate } from "@/lib/maintenance-plans/late-payment";
import {
  ensureStripeCustomer,
  getCustomerDefaultCardId,
} from "@/lib/customers/stripe";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";

export type CancelEnrollmentResult =
  | {
      ok: true;
      enrollmentId: string;
      cancellationFeeCharged: number;
      cancellationFeePaymentIntentId: string | null;
      cancellationFeeChargeError: string | null;
    }
  | {
      ok: false;
      code:
        | "NOT_FOUND"
        | "ALREADY_CANCELLED"
        | "DRAFT"
        | "BALANCE_DUE"
        | "CARD_REQUIRED"
        | "FEE_CHARGE_FAILED";
      error: string;
      balanceDue?: number;
      cancellationFee?: number;
    };

function isUnpaidPeriod(period: {
  status: string;
  dueDate: Date;
  paidAt: Date | null;
  amount: unknown;
}) {
  if (toNumber(period.amount as never) <= 0) return false;
  if (period.status === "DUE" || period.status === "FAILED") return true;
  if (period.status === "PENDING") {
    return isBillingPeriodLate({
      status: period.status,
      dueDate: period.dueDate,
      paidAt: period.paidAt,
    });
  }
  return false;
}

export function describeCancellationFeePolicy(params: {
  feeType: string;
  feeAmount: number | null;
  fee: number;
  noticeDays: number;
}) {
  const parts: string[] = [];
  if (params.fee <= 0) {
    parts.push("No cancellation fee applies.");
  } else if (params.feeType === "FIXED") {
    parts.push(`A fixed cancellation fee of $${params.fee.toFixed(2)} applies.`);
  } else if (params.feeType === "PERCENT") {
    parts.push(
      `A cancellation fee of ${params.feeAmount ?? 0}% of the annual plan price ($${params.fee.toFixed(2)}) applies.`
    );
  } else if (params.feeType === "REMAINDER_OF_YEAR") {
    parts.push(
      `The remaining balance of the current plan year ($${params.fee.toFixed(2)}) is due to cancel.`
    );
  } else {
    parts.push(`A cancellation fee of $${params.fee.toFixed(2)} applies.`);
  }
  if (params.noticeDays > 0) {
    parts.push(`Notice period: ${params.noticeDays} day${params.noticeDays === 1 ? "" : "s"}.`);
  }
  return parts.join(" ");
}

export async function previewEnrollmentCancellation(params: {
  companyId: string;
  enrollmentId: string;
  customerId?: string;
}) {
  const enrollment = await prisma.maintenancePlanEnrollment.findFirst({
    where: {
      id: params.enrollmentId,
      companyId: params.companyId,
      ...(params.customerId ? { customerId: params.customerId } : {}),
    },
    include: {
      template: {
        select: {
          name: true,
          basePrice: true,
          cancellationFeeType: true,
          cancellationFeeAmount: true,
          cancellationNoticeDays: true,
        },
      },
      billingPeriods: {
        select: {
          id: true,
          status: true,
          amount: true,
          dueDate: true,
          paidAt: true,
          periodStart: true,
        },
      },
    },
  });
  if (!enrollment) return null;

  const unpaid = enrollment.billingPeriods.filter(isUnpaidPeriod);
  const balanceDue = unpaid.reduce((sum, p) => sum + toNumber(p.amount), 0);
  const paidPeriods = enrollment.billingPeriods
    .filter((p) => p.status === "PAID")
    .map((p) => ({ periodStart: p.periodStart, amount: toNumber(p.amount) }));
  const feeAmount =
    enrollment.template.cancellationFeeAmount != null
      ? toNumber(enrollment.template.cancellationFeeAmount)
      : null;
  const cancellationFee = computeCancellationFee({
    basePrice: toNumber(enrollment.template.basePrice),
    feeType: enrollment.template.cancellationFeeType,
    feeAmount,
    startDate: enrollment.startDate,
    paidPeriods,
  });

  return {
    enrollmentId: enrollment.id,
    status: enrollment.status,
    planName: enrollment.template.name,
    balanceDue,
    unpaidPeriodIds: unpaid.map((p) => p.id),
    cancellationFee,
    cancellationFeeType: enrollment.template.cancellationFeeType,
    cancellationFeeAmount: feeAmount,
    cancellationNoticeDays: enrollment.template.cancellationNoticeDays,
    policySummary: describeCancellationFeePolicy({
      feeType: enrollment.template.cancellationFeeType,
      feeAmount,
      fee: cancellationFee,
      noticeDays: enrollment.template.cancellationNoticeDays,
    }),
    canCancel:
      enrollment.status !== "CANCELLED" &&
      enrollment.status !== "DRAFT" &&
      balanceDue <= 0,
  };
}

/**
 * Cancel a maintenance enrollment, optionally requiring arrears paid and a successful fee charge.
 */
export async function cancelMaintenanceEnrollment(params: {
  companyId: string;
  enrollmentId: string;
  customerId?: string;
  cancellationReason?: string | null;
  /** Portal: block cancel when unpaid periods remain. */
  requireOutstandingBalancePaid?: boolean;
  /** Portal: require fee to be charged successfully when fee > 0. */
  requireFeeChargeSuccess?: boolean;
}): Promise<CancelEnrollmentResult> {
  const existing = await prisma.maintenancePlanEnrollment.findFirst({
    where: {
      id: params.enrollmentId,
      companyId: params.companyId,
      ...(params.customerId ? { customerId: params.customerId } : {}),
    },
    include: {
      template: true,
      customer: { select: { id: true, name: true, email: true, stripeCustomerId: true } },
      billingPeriods: {
        select: {
          id: true,
          status: true,
          amount: true,
          dueDate: true,
          paidAt: true,
          periodStart: true,
        },
      },
    },
  });

  if (!existing) {
    return { ok: false, code: "NOT_FOUND", error: "Enrollment not found" };
  }
  if (existing.status === "CANCELLED") {
    return { ok: false, code: "ALREADY_CANCELLED", error: "Enrollment is already cancelled" };
  }
  if (existing.status === "DRAFT") {
    return { ok: false, code: "DRAFT", error: "Draft enrollments cannot be cancelled" };
  }

  const unpaid = existing.billingPeriods.filter(isUnpaidPeriod);
  const balanceDue = unpaid.reduce((sum, p) => sum + toNumber(p.amount), 0);

  if (params.requireOutstandingBalancePaid && balanceDue > 0) {
    return {
      ok: false,
      code: "BALANCE_DUE",
      error: `Pay your outstanding balance of $${balanceDue.toFixed(2)} before cancelling.`,
      balanceDue,
    };
  }

  const feeAmount =
    existing.template.cancellationFeeAmount != null
      ? toNumber(existing.template.cancellationFeeAmount)
      : null;
  const cancellationFeeCharged = computeCancellationFee({
    basePrice: toNumber(existing.template.basePrice),
    feeType: existing.template.cancellationFeeType,
    feeAmount,
    startDate: existing.startDate,
    paidPeriods: existing.billingPeriods
      .filter((p) => p.status === "PAID")
      .map((p) => ({ periodStart: p.periodStart, amount: toNumber(p.amount) })),
  });

  let cancellationFeePaymentIntentId: string | null = null;
  let cancellationFeeChargeError: string | null = null;

  if (cancellationFeeCharged > 0) {
    if (!process.env.STRIPE_SECRET_KEY) {
      cancellationFeeChargeError = "Payments are not configured";
    } else {
      const paymentMethodId =
        (await getCustomerDefaultCardId({
          customerId: existing.customerId,
          companyId: params.companyId,
        })) ?? existing.stripePaymentMethodId;

      const stripeCustomerId =
        (await ensureStripeCustomer(existing.customer, params.companyId)) ??
        existing.stripeCustomerId ??
        existing.customer.stripeCustomerId;

      if (!stripeCustomerId || !paymentMethodId) {
        cancellationFeeChargeError = "A card on file is required to pay the cancellation fee";
        if (params.requireFeeChargeSuccess) {
          return {
            ok: false,
            code: "CARD_REQUIRED",
            error: cancellationFeeChargeError,
            cancellationFee: cancellationFeeCharged,
          };
        }
      } else {
        try {
          const { getStripeClient } = await import("@/lib/stripe/client");
          const stripe = getStripeClient();
          try {
            await stripe.paymentMethods.attach(paymentMethodId, { customer: stripeCustomerId });
          } catch {
            // Already attached is fine.
          }
          await stripe.customers.update(stripeCustomerId, {
            invoice_settings: { default_payment_method: paymentMethodId },
          });

          const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(cancellationFeeCharged * 100),
            currency: "usd",
            customer: stripeCustomerId,
            payment_method: paymentMethodId,
            off_session: true,
            confirm: true,
            metadata: {
              enrollmentId: existing.id,
              companyId: params.companyId,
              purpose: "maintenance_cancellation_fee",
              feeType: existing.template.cancellationFeeType,
            },
          });

          if (paymentIntent.status === "succeeded") {
            cancellationFeePaymentIntentId = paymentIntent.id;
            const feePeriod = await prisma.maintenancePlanBillingPeriod.create({
              data: {
                enrollmentId: existing.id,
                periodStart: new Date(),
                periodEnd: new Date(),
                amount: cancellationFeeCharged,
                status: "DUE",
                dueDate: new Date(),
              },
            });
            await recordMaintenanceInvoicePayment({
              companyId: params.companyId,
              customerId: existing.customerId,
              enrollmentId: existing.id,
              billingPeriodId: feePeriod.id,
              amount: cancellationFeeCharged,
              stripePaymentIntentId: paymentIntent.id,
            });
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
            await prisma.maintenancePlanEnrollment.update({
              where: { id: existing.id },
              data: {
                stripeCustomerId,
                stripePaymentMethodId: paymentMethodId,
              },
            });
          } else {
            cancellationFeeChargeError = `Payment status: ${paymentIntent.status}`;
          }
        } catch (chargeError) {
          console.error("Cancellation fee charge failed:", chargeError);
          cancellationFeeChargeError =
            chargeError instanceof Error ? chargeError.message : "Failed to charge cancellation fee";
        }
      }
    }

    if (params.requireFeeChargeSuccess && cancellationFeeChargeError) {
      return {
        ok: false,
        code: "FEE_CHARGE_FAILED",
        error: cancellationFeeChargeError,
        cancellationFee: cancellationFeeCharged,
      };
    }
  }

  if (existing.stripeSubscriptionId && process.env.STRIPE_SECRET_KEY) {
    try {
      const { getStripeClient } = await import("@/lib/stripe/client");
      await getStripeClient().subscriptions.cancel(existing.stripeSubscriptionId);
    } catch (stripeError) {
      console.error("Stripe subscription cancel failed:", stripeError);
    }
  }

  await prisma.maintenancePlanEnrollment.update({
    where: { id: existing.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancellationReason:
        typeof params.cancellationReason === "string" && params.cancellationReason.trim()
          ? params.cancellationReason.trim()
          : null,
      cancellationFeeCharged,
      autoRenew: false,
    },
  });

  await prisma.maintenancePlanBillingPeriod.updateMany({
    where: { enrollmentId: existing.id, status: { in: ["PENDING", "DUE"] } },
    data: { status: "CANCELLED" },
  });

  await prisma.maintenancePlanVisit.updateMany({
    where: {
      enrollmentId: existing.id,
      status: { in: ["UNSCHEDULED", "OVERDUE"] },
    },
    data: { status: "SKIPPED" },
  });

  return {
    ok: true,
    enrollmentId: existing.id,
    cancellationFeeCharged,
    cancellationFeePaymentIntentId,
    cancellationFeeChargeError,
  };
}
