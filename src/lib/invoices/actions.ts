import { InvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getInvoiceForCompany } from "@/lib/invoices/queries";
import { toNumber } from "@/lib/visits/totals";

export async function voidInvoice(companyId: string, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, companyId },
    include: { payments: true },
  });
  if (!invoice) return { error: "Not found", status: 404 as const };
  if (invoice.status === InvoiceStatus.VOID) {
    return { error: "Invoice is already void", status: 400 as const };
  }
  if (invoice.status === InvoiceStatus.REFUNDED) {
    return { error: "Refunded invoices cannot be voided", status: 400 as const };
  }

  const amountPaid = invoice.payments.reduce((sum, payment) => {
    if (payment.refundedAt) return sum;
    return sum + toNumber(payment.amount);
  }, 0);
  if (amountPaid > 0) {
    return {
      error: "Refund payments before voiding an invoice with collected funds",
      status: 400 as const,
    };
  }

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: InvoiceStatus.VOID },
  });

  const updated = await getInvoiceForCompany(companyId, invoice.id);
  return { invoice: updated };
}

export async function deleteInvoice(
  companyId: string,
  invoiceId: string,
  options: { voidFirst?: boolean } = {}
) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, companyId },
    include: { payments: true },
  });
  if (!invoice) return { error: "Not found", status: 404 as const };

  if (options.voidFirst && invoice.status !== InvoiceStatus.VOID) {
    const voided = await voidInvoice(companyId, invoiceId);
    if ("error" in voided) {
      return voided;
    }
  }

  await prisma.invoice.delete({ where: { id: invoice.id } });
  return { ok: true as const, invoiceNumber: invoice.invoiceNumber };
}
