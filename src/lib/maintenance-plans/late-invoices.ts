import { InvoiceStatus } from "@prisma/client";
import { ACTIVE_MAINTENANCE_ENROLLMENT_STATUSES } from "@/lib/company/features";
import { isBillingPeriodLate } from "@/lib/maintenance-plans/late-payment";
import { prisma } from "@/lib/prisma";
import { nextInvoiceNumber } from "@/lib/visits/queries";
import { toNumber } from "@/lib/visits/totals";

function invoiceStillCollectible(status: string | null | undefined) {
  return Boolean(status && status !== InvoiceStatus.VOID && status !== InvoiceStatus.REFUNDED);
}

/** Create an unpaid invoice for each late/failed plan charge so it shows on the invoices tab. */
export async function ensureLatePlanBillingInvoices(companyId: string, customerId?: string) {
  const periods = await prisma.maintenancePlanBillingPeriod.findMany({
    where: {
      status: { in: ["PENDING", "DUE", "FAILED"] },
      amount: { gt: 0 },
      enrollment: {
        companyId,
        ...(customerId ? { customerId } : {}),
        status: { in: [...ACTIVE_MAINTENANCE_ENROLLMENT_STATUSES] },
      },
    },
    include: {
      invoice: { select: { id: true, status: true } },
      enrollment: {
        select: {
          customerId: true,
          template: { select: { name: true } },
        },
      },
    },
  });

  const late = periods.filter((period) => {
    if (invoiceStillCollectible(period.invoice?.status)) return false;
    return isBillingPeriodLate({
      status: period.status,
      dueDate: period.dueDate,
      paidAt: period.paidAt,
    });
  });

  for (const period of late) {
    const amount = toNumber(period.amount);
    if (amount <= 0) continue;
    const planName = period.enrollment.template.name;
    const invoiceNumber = await nextInvoiceNumber(companyId);
    const invoice = await prisma.invoice.create({
      data: {
        companyId,
        customerId: period.enrollment.customerId,
        invoiceNumber,
        status: InvoiceStatus.SENT,
        sentAt: new Date(),
        subtotal: amount,
        total: amount,
        lineItems: {
          create: [
            {
              name: `${planName} (past due)`,
              description: "Maintenance plan payment",
              quantity: 1,
              unitPrice: amount,
              total: amount,
            },
          ],
        },
      },
    });

    await prisma.maintenancePlanBillingPeriod.update({
      where: { id: period.id },
      data: { invoiceId: invoice.id },
    });
  }

  return { created: late.length };
}
