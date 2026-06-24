import { getInvoicePayUrl } from "@/lib/invoices/pay-url";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";
import { buildNotificationContext } from "./context";
import { sendOperationalNotification } from "./send";

export async function notifyInvoiceViaTemplates(params: {
  invoiceId: string;
  companyId: string;
  event: "INVOICE_SENT" | "INVOICE_REMINDER" | "INVOICE_PAID_RECEIPT";
  smsBackupOnly?: boolean;
}) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: params.invoiceId, companyId: params.companyId },
    include: { customer: true, company: true, payments: true },
  });
  if (!invoice?.customer) return { emailSent: false, smsSent: false, skipped: ["no customer"] };

  const paid = invoice.payments.reduce((sum, payment) => {
    if (payment.refundedAt) return sum;
    return sum + toNumber(payment.amount);
  }, 0);
  const balanceDue = Math.max(0, toNumber(invoice.total) - paid);

  const amount =
    params.event === "INVOICE_PAID_RECEIPT" ? toNumber(invoice.total) : balanceDue;

  const context = buildNotificationContext({
    company: invoice.company,
    customer: invoice.customer,
    invoice: {
      invoiceNumber: invoice.invoiceNumber,
      amount,
      publicToken: invoice.publicToken,
    },
  });

  return sendOperationalNotification({
    companyId: params.companyId,
    event: params.event,
    recipient: {
      customerId: invoice.customerId,
      name: invoice.customer.name,
      email: invoice.customer.email,
      phone: invoice.customer.phone,
    },
    context,
    options: {
      invoiceId: invoice.id,
      linkPlaceholders: { invoice: getInvoicePayUrl(invoice.publicToken) },
      smsBackupOnly: params.smsBackupOnly,
    },
  });
}
