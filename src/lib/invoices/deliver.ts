import { notifyInvoiceViaTemplates } from "@/lib/notifications/invoice-notify";
import { getInvoiceForCompany } from "@/lib/invoices/queries";
import { getInvoicePayUrl } from "@/lib/invoices/pay-url";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";

export async function deliverInvoice(params: {
  invoiceId: string;
  companyId: string;
  kind: "send" | "remind";
}) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: params.invoiceId, companyId: params.companyId },
    include: { customer: true, company: true, payments: true },
  });
  if (!invoice) return { error: "Not found", status: 404 as const };

  const paid = invoice.payments.reduce((sum, payment) => {
    if (payment.refundedAt) return sum;
    return sum + toNumber(payment.amount);
  }, 0);
  const balanceDue = Math.max(0, toNumber(invoice.total) - paid);
  if (balanceDue <= 0) return { error: "Invoice has no balance due", status: 400 as const };

  const payUrl = getInvoicePayUrl(invoice.publicToken);
  const { emailSent, smsSent } = await notifyInvoiceViaTemplates({
    invoiceId: params.invoiceId,
    companyId: params.companyId,
    event: params.kind === "remind" ? "INVOICE_REMINDER" : "INVOICE_SENT",
  });

  if (!emailSent && !smsSent) {
    return {
      error: "No email or SMS channel configured. Copy the pay link to send manually.",
      status: 503 as const,
      payUrl,
    };
  }

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      sentAt: new Date(),
      status: invoice.status === "DRAFT" ? "SENT" : invoice.status,
    },
  });

  const updated = await getInvoiceForCompany(params.companyId, invoice.id);
  return { invoice: updated, emailSent, smsSent, payUrl };
}
