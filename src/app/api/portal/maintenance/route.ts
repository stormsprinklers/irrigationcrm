import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalUnauthorizedResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import {
  frequencyOptionsForTemplate,
  getPortalBillingSummary,
} from "@/lib/portal/billing-summary";
import { isBillingPeriodLate } from "@/lib/maintenance-plans/late-payment";
import { computeCancellationFee } from "@/lib/maintenance-plans/billing";
import { describeCancellationFeePolicy } from "@/lib/maintenance-plans/cancel-enrollment";

export async function GET() {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();
  if (!portalFeatureEnabled(ctx.company, "maintenance")) {
    return portalForbiddenResponse("Maintenance plans are not available in the portal");
  }

  const [enrollments, billing] = await Promise.all([
    prisma.maintenancePlanEnrollment.findMany({
      where: { companyId: ctx.companyId, customerId: ctx.customerId },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            basePrice: true,
            allowedBillingFrequencies: true,
            durationYears: true,
            cancellationFeeType: true,
            cancellationFeeAmount: true,
            cancellationNoticeDays: true,
          },
        },
        property: { select: { id: true, name: true, address: true } },
        planVisits: {
          orderBy: [{ dueYear: "asc" }, { dueMonth: "asc" }],
          include: {
            visitTemplate: { select: { name: true, visitTitle: true, season: true } },
            visit: { select: { id: true, title: true, startAt: true, status: true } },
          },
        },
        billingPeriods: { orderBy: { dueDate: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    }),
    getPortalBillingSummary({
      companyId: ctx.companyId,
      customerId: ctx.customerId,
    }),
  ]);

  return NextResponse.json({
    billing: {
      maintenanceBalanceDue: billing.maintenanceBalanceDue,
      hasCardOnFile: billing.hasCardOnFile,
      card: billing.card,
    },
    enrollments: enrollments.map((e) => {
      const unpaid = e.billingPeriods.filter((bp) => {
        if (bp.status === "DUE" || bp.status === "FAILED") return true;
        if (bp.status === "PENDING") {
          return isBillingPeriodLate({
            status: bp.status,
            dueDate: bp.dueDate,
            paidAt: bp.paidAt,
          });
        }
        return false;
      });
      const basePrice = toNumber(e.template.basePrice);
      const feeAmount =
        e.template.cancellationFeeAmount != null
          ? toNumber(e.template.cancellationFeeAmount)
          : null;
      const cancellationFee = computeCancellationFee({
        basePrice,
        feeType: e.template.cancellationFeeType,
        feeAmount,
        startDate: e.startDate,
        paidPeriods: e.billingPeriods
          .filter((bp) => bp.status === "PAID")
          .map((bp) => ({ periodStart: bp.periodStart, amount: toNumber(bp.amount) })),
      });
      const balanceDue = unpaid.reduce((sum, bp) => sum + toNumber(bp.amount), 0);
      return {
        id: e.id,
        status: e.status,
        startDate: e.startDate.toISOString(),
        endDate: e.endDate?.toISOString() ?? null,
        renewalDate: e.renewalDate?.toISOString() ?? null,
        billingFrequency: e.billingFrequency,
        balanceDue,
        canCancel: e.status !== "CANCELLED" && e.status !== "DRAFT",
        cancellation: {
          fee: cancellationFee,
          feeType: e.template.cancellationFeeType,
          feeAmount,
          noticeDays: e.template.cancellationNoticeDays,
          policySummary: describeCancellationFeePolicy({
            feeType: e.template.cancellationFeeType,
            feeAmount,
            fee: cancellationFee,
            noticeDays: e.template.cancellationNoticeDays,
          }),
        },
        frequencyOptions: frequencyOptionsForTemplate({
          basePrice,
          allowedBillingFrequencies: e.template.allowedBillingFrequencies,
          durationYears: e.template.durationYears,
        }),
        template: {
          name: e.template.name,
          basePrice,
          allowedBillingFrequencies: e.template.allowedBillingFrequencies,
        },
        property: e.property,
        planVisits: e.planVisits.map((pv) => ({
          id: pv.id,
          status: pv.status,
          dueYear: pv.dueYear,
          dueMonth: pv.dueMonth,
          visitTemplate: pv.visitTemplate,
          visit: pv.visit
            ? {
                id: pv.visit.id,
                title: pv.visit.title,
                startAt: pv.visit.startAt?.toISOString() ?? null,
                status: pv.visit.status,
              }
            : null,
        })),
        billingPeriods: e.billingPeriods.map((bp) => ({
          id: bp.id,
          periodStart: bp.periodStart.toISOString(),
          periodEnd: bp.periodEnd.toISOString(),
          amount: toNumber(bp.amount),
          status: bp.status,
          dueDate: bp.dueDate.toISOString(),
          paidAt: bp.paidAt?.toISOString() ?? null,
          isLate: isBillingPeriodLate({
            status: bp.status,
            dueDate: bp.dueDate,
            paidAt: bp.paidAt,
          }),
        })),
        unpaidPeriods: unpaid.map((bp) => ({
          id: bp.id,
          amount: toNumber(bp.amount),
          dueDate: bp.dueDate.toISOString(),
          status: bp.status,
        })),
      };
    }),
  });
}
