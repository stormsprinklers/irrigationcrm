import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";

export { computeCancellationFee } from "@/lib/maintenance-plans/billing";

export async function applyPlanDiscountsToVisit(visitId: string, enrollmentId: string) {
  const enrollment = await prisma.maintenancePlanEnrollment.findUnique({
    where: { id: enrollmentId },
    include: { template: { include: { discounts: true } } },
  });
  if (!enrollment) return;

  const jobDiscounts = enrollment.template.discounts.filter(
    (d) => d.appliesTo === "ALL_JOBS" || d.appliesTo === "VISIT_LABOR"
  );

  for (const discount of jobDiscounts) {
    const existing = await prisma.discount.findFirst({
      where: { visitId, label: discount.label ?? "Plan discount" },
    });
    if (existing) continue;

    await prisma.discount.create({
      data: {
        visitId,
        label: discount.label ?? `${enrollment.template.name} discount`,
        type: discount.type,
        amount: discount.amount,
      },
    });
  }
}

export async function completeMaintenancePlanVisit(visitId: string) {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    select: { maintenancePlanVisitId: true },
  });
  if (!visit?.maintenancePlanVisitId) return;

  await prisma.maintenancePlanVisit.update({
    where: { id: visit.maintenancePlanVisitId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
}

export async function recordMaintenanceInvoicePayment(params: {
  companyId: string;
  customerId: string;
  enrollmentId: string;
  billingPeriodId: string;
  amount: number;
  stripePaymentIntentId?: string | null;
}) {
  const company = await prisma.company.findUnique({ where: { id: params.companyId } });
  if (!company) return null;

  const count = await prisma.invoice.count({ where: { companyId: params.companyId } });
  const invoiceNumber = `INV-${String(count + 1).padStart(5, "0")}`;

  const invoice = await prisma.invoice.create({
    data: {
      companyId: params.companyId,
      customerId: params.customerId,
      invoiceNumber,
      status: "PAID",
      subtotal: params.amount,
      total: params.amount,
      paidAt: new Date(),
      stripePaymentIntentId: params.stripePaymentIntentId ?? null,
      lineItems: {
        create: [
          {
            name: "Maintenance plan payment",
            quantity: 1,
            unitPrice: params.amount,
            total: params.amount,
          },
        ],
      },
      payments: {
        create: {
          amount: params.amount,
          method: "STRIPE",
          stripePaymentIntentId: params.stripePaymentIntentId ?? null,
        },
      },
    },
  });

  await prisma.maintenancePlanBillingPeriod.update({
    where: { id: params.billingPeriodId },
    data: {
      status: "PAID",
      paidAt: new Date(),
      invoiceId: invoice.id,
      stripePaymentIntentId: params.stripePaymentIntentId ?? null,
    },
  });

  return invoice;
}
