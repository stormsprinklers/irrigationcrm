import { prisma } from "@/lib/prisma";
import { getInvoiceForCompany } from "@/lib/invoices/queries";
import { getInvoicePayUrl } from "@/lib/invoices/pay-url";
import { nextInvoiceNumber } from "@/lib/visits/queries";
import { computeTotals, sumDiscounts, sumLineItems, toNumber } from "@/lib/visits/totals";

export type SyncVisitInvoiceResult =
  | {
      ok: true;
      invoiceId: string;
      balanceDue: number;
      payLink: string;
      invoice: NonNullable<Awaited<ReturnType<typeof getInvoiceForCompany>>>;
    }
  | { ok: false; error: string; status: number };

export async function syncVisitInvoice(params: {
  companyId: string;
  visitId: string;
}): Promise<SyncVisitInvoiceResult> {
  const visit = await prisma.visit.findFirst({
    where: { id: params.visitId, companyId: params.companyId },
    include: {
      customer: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
      discounts: true,
    },
  });

  if (!visit) return { ok: false, error: "Visit not found", status: 404 };
  if (!visit.customerId || !visit.customer) {
    return { ok: false, error: "Visit must have a customer to create an invoice", status: 400 };
  }
  if (!visit.lineItems.length) {
    return { ok: false, error: "Add line items before creating an invoice", status: 400 };
  }

  const subtotal = sumLineItems(visit.lineItems);
  const discountTotal = sumDiscounts(subtotal, visit.discounts);
  const { total } = computeTotals(subtotal, discountTotal);

  if (total <= 0) {
    return { ok: false, error: "Visit total must be greater than zero", status: 400 };
  }

  let invoice = await prisma.invoice.findFirst({
    where: {
      visitId: visit.id,
      companyId: params.companyId,
      status: { in: ["DRAFT", "SENT", "PARTIAL"] },
    },
    include: { payments: true },
  });

  const computeBalanceDue = (inv: NonNullable<typeof invoice>) => {
    const paid = inv.payments.reduce((sum, payment) => {
      if (payment.refundedAt) return sum;
      return sum + toNumber(payment.amount);
    }, 0);
    return Math.max(0, total - paid);
  };

  if (!invoice) {
    const created = await prisma.invoice.create({
      data: {
        companyId: params.companyId,
        customerId: visit.customerId,
        visitId: visit.id,
        invoiceNumber: await nextInvoiceNumber(params.companyId),
        status: "SENT",
        subtotal,
        discountTotal,
        total,
        lineItems: {
          create: visit.lineItems.map((item, index) => ({
            name: item.name,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.total,
            sortOrder: index,
          })),
        },
      },
    });
    invoice = await prisma.invoice.findFirstOrThrow({
      where: { id: created.id },
      include: { payments: true },
    });
  } else {
    invoice = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { subtotal, discountTotal, total, status: "SENT" },
      include: { payments: true },
    });
  }

  const balanceDue = computeBalanceDue(invoice);
  if (balanceDue <= 0) {
    return { ok: false, error: "This visit invoice is already paid", status: 400 };
  }

  const serialized = await getInvoiceForCompany(params.companyId, invoice.id);
  if (!serialized) return { ok: false, error: "Invoice not found", status: 404 };

  return {
    ok: true,
    invoiceId: invoice.id,
    balanceDue,
    payLink: getInvoicePayUrl(invoice.publicToken),
    invoice: serialized,
  };
}
