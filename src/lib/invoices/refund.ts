import type { InvoiceStatus, Payment } from "@prisma/client";
import { getInvoiceForCompany } from "@/lib/invoices/queries";
import type { InvoiceDTO } from "@/lib/invoices/types";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe/client";
import { toNumber } from "@/lib/visits/totals";

export type IssueRefundParams = {
  paymentId?: string;
  /** Refund amount in dollars. Defaults to the full refundable balance on the payment. */
  amount?: number;
  reason?: string;
};

export type IssueRefundResult = {
  invoice: InvoiceDTO;
  refundAmount: number;
  stripeRefundId: string | null;
  paymentId: string;
};

export class RefundError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
    this.name = "RefundError";
  }
}

function paymentRefundableAmount(payment: Payment) {
  if (payment.refundedAt) return 0;
  return toNumber(payment.amount);
}

function computeAmountPaid(payments: Payment[]) {
  return payments.reduce((sum, payment) => sum + paymentRefundableAmount(payment), 0);
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

function pickPayment(payments: Payment[], paymentId?: string) {
  if (paymentId) {
    return payments.find((payment) => payment.id === paymentId) ?? null;
  }

  return (
    payments.find((payment) => paymentRefundableAmount(payment) > 0 && payment.stripePaymentIntentId) ??
    payments.find((payment) => paymentRefundableAmount(payment) > 0) ??
    null
  );
}

export async function issueInvoiceRefund(
  companyId: string,
  invoiceId: string,
  params: IssueRefundParams = {}
): Promise<IssueRefundResult> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, companyId },
    include: { payments: { orderBy: { paidAt: "desc" } } },
  });

  if (!invoice) {
    throw new RefundError("Invoice not found", 404);
  }

  const payment = pickPayment(invoice.payments, params.paymentId);
  if (!payment) {
    throw new RefundError("No refundable payment found", 404);
  }

  const refundable = paymentRefundableAmount(payment);
  if (refundable <= 0) {
    throw new RefundError("Payment has already been refunded", 400);
  }

  const refundAmount =
    params.amount != null && !Number.isNaN(Number(params.amount))
      ? Number(params.amount)
      : refundable;

  if (refundAmount <= 0) {
    throw new RefundError("Refund amount must be greater than zero", 400);
  }

  if (refundAmount > refundable + 0.001) {
    throw new RefundError(`Refund amount cannot exceed ${refundable.toFixed(2)}`, 400);
  }

  let stripeRefundId: string | null = null;

  if (payment.method === "STRIPE" && payment.stripePaymentIntentId) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new RefundError("Stripe is not configured", 503);
    }

    const stripe = getStripeClient();
    const refund = await stripe.refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      amount: Math.round(refundAmount * 100),
      ...(params.reason?.trim() ? { reason: "requested_by_customer" as const } : {}),
      metadata: {
        invoiceId: invoice.id,
        paymentId: payment.id,
        companyId,
        ...(params.reason?.trim() ? { note: params.reason.trim().slice(0, 500) } : {}),
      },
    });
    stripeRefundId = refund.id;
  } else if (payment.method === "STRIPE" && !payment.stripePaymentIntentId) {
    throw new RefundError("This Stripe payment cannot be refunded automatically", 400);
  }

  const isFullRefund = refundAmount >= refundable - 0.001;
  const remainingAmount = isFullRefund ? 0 : refundable - refundAmount;

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      amount: remainingAmount,
      refundedAt: isFullRefund ? new Date() : null,
      stripeRefundId: stripeRefundId ?? payment.stripeRefundId,
    },
  });

  const updatedPayments = await prisma.payment.findMany({
    where: { invoiceId: invoice.id },
    orderBy: { paidAt: "desc" },
  });

  const amountPaid = computeAmountPaid(updatedPayments);
  const total = toNumber(invoice.total);
  const hadRefund = updatedPayments.some(
    (entry) => entry.refundedAt != null || entry.id === payment.id
  );

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: resolveInvoiceStatus({
        total,
        amountPaid,
        sentAt: invoice.sentAt,
        hadRefund,
      }),
      paidAt: amountPaid > 0 ? invoice.paidAt ?? new Date() : null,
    },
  });

  const updatedInvoice = await getInvoiceForCompany(companyId, invoiceId);
  if (!updatedInvoice) {
    throw new RefundError("Invoice not found after refund", 404);
  }

  return {
    invoice: updatedInvoice,
    refundAmount,
    stripeRefundId,
    paymentId: payment.id,
  };
}
