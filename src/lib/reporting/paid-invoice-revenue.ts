import { InvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function getPaidInvoiceRevenue(
  companyId: string,
  start: Date,
  end: Date
) {
  const result = await prisma.invoice.aggregate({
    where: {
      companyId,
      status: InvoiceStatus.PAID,
      paidAt: { gte: start, lte: end },
    },
    _sum: { total: true },
  });

  return Number(result._sum.total ?? 0);
}
