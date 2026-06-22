import { prisma } from "@/lib/prisma";
import { computeVisitProfit } from "@/lib/visits/profit";
import { toNumber } from "@/lib/visits/totals";

export type CustomerSummary = {
  createdAt: string;
  lastVisitAt: string | null;
  lifetimeValue: number;
  lifetimeGrossProfit: number;
  outstandingBalance: number;
};

export async function getCustomerSummary(
  companyId: string,
  customerId: string
): Promise<CustomerSummary | null> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, companyId },
    select: { createdAt: true },
  });
  if (!customer) return null;

  const lastVisit = await prisma.visit.findFirst({
    where: { customerId, companyId, status: "COMPLETED" },
    orderBy: [{ endAt: "desc" }, { startAt: "desc" }],
    select: { endAt: true, startAt: true },
  });

  const invoices = await prisma.invoice.findMany({
    where: { customerId, companyId, status: { not: "VOID" } },
    include: { payments: true },
  });

  let lifetimeValue = 0;
  let outstandingBalance = 0;

  for (const invoice of invoices) {
    const total = toNumber(invoice.total);
    const paid = invoice.payments.reduce((sum, payment) => {
      if (payment.refundedAt) return sum;
      return sum + toNumber(payment.amount);
    }, 0);
    lifetimeValue += paid;

    if (invoice.status !== "PAID" && invoice.status !== "REFUNDED") {
      outstandingBalance += Math.max(0, total - paid);
    }
  }

  const completedVisits = await prisma.visit.findMany({
    where: { customerId, companyId, status: "COMPLETED" },
    select: { id: true },
  });

  let lifetimeGrossProfit = 0;
  for (const visit of completedVisits) {
    const profit = await computeVisitProfit(companyId, visit.id);
    if (profit) lifetimeGrossProfit += profit.grossProfit;
  }
  lifetimeGrossProfit = Math.round(lifetimeGrossProfit * 100) / 100;
  lifetimeValue = Math.round(lifetimeValue * 100) / 100;
  outstandingBalance = Math.round(outstandingBalance * 100) / 100;

  return {
    createdAt: customer.createdAt.toISOString(),
    lastVisitAt:
      lastVisit?.endAt?.toISOString() ?? lastVisit?.startAt?.toISOString() ?? null,
    lifetimeValue,
    lifetimeGrossProfit,
    outstandingBalance,
  };
}
