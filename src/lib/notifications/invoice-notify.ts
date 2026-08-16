import { getInvoicePayUrl } from "@/lib/invoices/pay-url";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";
import { polishWorkSummaryForCustomer } from "@/lib/visits/polish-work-summary";
import { buildReceiptPdf, pdfEmailAttachment } from "@/lib/pdf/customer-documents";
import { buildNotificationContext } from "./context";
import { buildPaidReceiptExtras } from "./receipt-extras";
import { sendOperationalNotification } from "./send";
import type { NotificationEvent } from "./templates";

export async function notifyInvoiceViaTemplates(params: {
  invoiceId: string;
  companyId: string;
  event: Extract<
    NotificationEvent,
    "INVOICE_SENT" | "INVOICE_REMINDER" | "INVOICE_PAID_RECEIPT" | "INVOICE_PAYMENT_FAILED"
  >;
  smsBackupOnly?: boolean;
  /** Prefer Stripe Checkout session.url when notifying customers to pay / retry. */
  payUrlOverride?: string | null;
  amountOverride?: number | null;
}) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: params.invoiceId, companyId: params.companyId },
    include: {
      customer: true,
      company: true,
      payments: true,
      visit: {
        include: {
          attachments: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  if (!invoice?.customer) return { emailSent: false, smsSent: false, skipped: ["no customer"] };

  const paid = invoice.payments.reduce((sum, payment) => {
    if (payment.refundedAt) return sum;
    return sum + toNumber(payment.amount);
  }, 0);
  const balanceDue = Math.max(0, toNumber(invoice.total) - paid);

  const amount =
    params.amountOverride != null && params.amountOverride > 0
      ? params.amountOverride
      : params.event === "INVOICE_PAID_RECEIPT"
        ? toNumber(invoice.total)
        : balanceDue;

  const payUrl = params.payUrlOverride?.trim() || getInvoicePayUrl(invoice.publicToken);

  let customerWorkSummary: string | null = null;
  if (params.event === "INVOICE_PAID_RECEIPT" && invoice.visit?.workSummary?.trim()) {
    customerWorkSummary = invoice.visit.customerWorkSummary?.trim() || null;
    if (!customerWorkSummary) {
      customerWorkSummary = await polishWorkSummaryForCustomer(invoice.visit.workSummary);
      if (customerWorkSummary) {
        await prisma.visit.update({
          where: { id: invoice.visit.id },
          data: { customerWorkSummary },
        });
      }
    }
  }

  const context = buildNotificationContext({
    company: invoice.company,
    customer: invoice.customer,
    invoice: {
      invoiceNumber: invoice.invoiceNumber,
      amount,
      publicToken: invoice.publicToken,
    },
    visit: invoice.visit
      ? {
          title: invoice.visit.title,
          startAt: invoice.visit.startAt,
          address: invoice.visit.address,
          city: invoice.visit.city,
          state: invoice.visit.state,
          zip: invoice.visit.zip,
        }
      : undefined,
  });
  if (customerWorkSummary) {
    context.work_summary = customerWorkSummary;
  }

  // Force invoice_link / payUrl placeholders to the Stripe (or override) URL.
  context.invoice_link = payUrl;
  context.payUrl = payUrl;

  const receiptExtras =
    params.event === "INVOICE_PAID_RECEIPT"
      ? buildPaidReceiptExtras({
          workSummary: customerWorkSummary,
          reviewUrl: invoice.company.googleReviewUrl?.trim() || null,
          invoicePublicToken: invoice.publicToken,
          media: (invoice.visit?.attachments ?? []).map((item) => ({
            id: item.id,
            fileName: item.fileName,
            mimeType: item.mimeType,
          })),
        })
      : { html: "", text: "" };

  let emailAttachments: Array<{ filename: string; contentType: string; content: string }> | undefined;
  if (params.event === "INVOICE_PAID_RECEIPT") {
    try {
      const pdf = await buildReceiptPdf({
        invoiceId: invoice.id,
        companyId: params.companyId,
        workSummary: customerWorkSummary,
        reviewUrl: invoice.company.googleReviewUrl?.trim() || null,
      });
      if (pdf) {
        emailAttachments = [
          pdfEmailAttachment(
            `Receipt-${invoice.invoiceNumber.replace(/[^\w]+/g, "-")}.pdf`,
            pdf
          ),
        ];
      }
    } catch (err) {
      console.error("Receipt PDF failed:", err);
    }
  }

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
      visitId: invoice.visitId ?? undefined,
      linkPlaceholders: {
        invoice: payUrl,
        ...(invoice.company.googleReviewUrl?.trim()
          ? { review: invoice.company.googleReviewUrl.trim() }
          : {}),
      },
      htmlAppend: receiptExtras.html || undefined,
      textAppend: receiptExtras.text || undefined,
      emailAttachments,
      smsBackupOnly: params.smsBackupOnly,
    },
  });
}
