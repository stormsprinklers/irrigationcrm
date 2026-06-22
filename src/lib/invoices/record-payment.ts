import type { InvoiceStatus } from "@prisma/client";
import { notifyInvoiceReceipt } from "@/lib/invoices/notify";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";

type PaymentRow = { amount: unknown; refundedAt: Date | null };

function computeAmountPaid(payments: PaymentRow[]) {
  return payments.reduce((sum, payment) => {
    if (payment.refundedAt) return sum;
    return sum + toNumber(payment.amount);
  }, 0);
}

function resolveInvoiceStatus(params: {
  total: number;
  amountPaid: number;
  sentAt: Date | null;
  hadRefund: boolean;
}): InvoiceStatus {
  const { total, amountPaid, sentAt, hadRefund } = params;

  if (amountPaid <= 0 && hadRefund) return "REFUNDED";
  if (amountPaid <= 0) return sentAt ? "SENT" : "DRAFT";
  if (amountPaid >= total) return "PAID";
  return "PARTIAL";
}

export type RecordInvoicePaymentParams = {
  invoiceId: string;
  amount: number;
  stripePaymentIntentId?: string | null;
  stripeCheckoutSessionId?: string | null;
};

export type RecordInvoicePaymentResult = {
  recorded: boolean;
  alreadyRecorded: boolean;
  invoiceStatus: InvoiceStatus;
  invoiceId: string;
};

export async function recordInvoicePayment(
  params: RecordInvoicePaymentParams
): Promise<RecordInvoicePaymentResult | null> {
  if (params.amount <= 0) return null;

  if (params.stripePaymentIntentId) {
    const existing = await prisma.payment.findFirst({
      where: { stripePaymentIntentId: params.stripePaymentIntentId },
    });
    if (existing) {
      const invoice = await prisma.invoice.findUnique({
        where: { id: existing.invoiceId },
        select: { status: true, id: true },
      });
      return {
        recorded: false,
        alreadyRecorded: true,
        invoiceStatus: invoice?.status ?? "PAID",
        invoiceId: existing.invoiceId,
      };
    }
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: params.invoiceId },
    include: {
      customer: true,
      company: true,
      payments: true,
    },
  });

  if (!invoice) return null;

  const hadRefund = invoice.payments.some((payment) => payment.refundedAt != null);
  const total = toNumber(invoice.total);
  const priorPaid = computeAmountPaid(invoice.payments);
  const nextPaid = priorPaid + params.amount;
  const nextStatus = resolveInvoiceStatus({
    total,
    amountPaid: nextPaid,
    sentAt: invoice.sentAt,
    hadRefund,
  });

  await prisma.$transaction([
    prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        amount: params.amount,
        method: "STRIPE",
        stripePaymentIntentId: params.stripePaymentIntentId ?? null,
      },
    }),
    prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: nextStatus,
        paidAt: nextPaid >= total ? invoice.paidAt ?? new Date() : invoice.paidAt,
        ...(params.stripePaymentIntentId
          ? { stripePaymentIntentId: params.stripePaymentIntentId }
          : {}),
        ...(params.stripeCheckoutSessionId
          ? { stripeCheckoutSessionId: params.stripeCheckoutSessionId }
          : {}),
      },
    }),
  ]);

  if (invoice.visitId && nextStatus === "PAID") {
    await prisma.visit.updateMany({
      where: {
        id: invoice.visitId,
        status: { notIn: ["CANCELLED", "COMPLETED"] },
      },
      data: { status: "COMPLETED" },
    });
  }

  if (invoice.company.notifyInvoicePaid) {
    await notifyInvoiceReceipt({
      customerName: invoice.customer.name,
      customerEmail: invoice.customer.email,
      customerPhone: invoice.customer.phone,
      companyName: invoice.company.name,
      sendgridFrom: invoice.company.sendgridFrom,
      twilioPhone: invoice.company.twilioPhone,
      invoiceNumber: invoice.invoiceNumber,
      amount: params.amount,
      publicToken: invoice.publicToken,
    });
  }

  return {
    recorded: true,
    alreadyRecorded: false,
    invoiceStatus: nextStatus,
    invoiceId: invoice.id,
  };
}
