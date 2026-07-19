import type { InvoiceStatus } from "@prisma/client";
import { notifyInvoiceViaTemplates } from "@/lib/notifications/invoice-notify";
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
  method?: "STRIPE" | "CASH" | "CHECK" | "OTHER";
  stripePaymentIntentId?: string | null;
  stripeCheckoutSessionId?: string | null;
  recordedByUserId?: string | null;
  /** Stable key from offline clients so retries do not create duplicate payments. */
  clientIdempotencyKey?: string | null;
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

  const idempotencyKey = params.clientIdempotencyKey?.trim() || null;
  if (idempotencyKey) {
    const existing = await prisma.payment.findFirst({
      where: { clientIdempotencyKey: idempotencyKey },
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
        method: params.method ?? "STRIPE",
        stripePaymentIntentId: params.stripePaymentIntentId ?? null,
        clientIdempotencyKey: idempotencyKey,
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

  if (params.method === "CASH" || params.method === "CHECK") {
    const { notifyCashCheckPayment } = await import("@/lib/notifications/payment-events");
    await notifyCashCheckPayment({
      companyId: invoice.companyId,
      invoiceId: invoice.id,
      visitId: invoice.visitId,
      amount: params.amount,
      method: params.method,
      customerName: invoice.customer.name,
      invoiceNumber: invoice.invoiceNumber,
      recordedByUserId: params.recordedByUserId ?? null,
    }).catch((err) => {
      console.error("Cash/check admin notify failed:", err);
    });
  } else {
    // Stripe / card / other online payments
    const { notifyAdminsOfPaymentOutcome } = await import("@/lib/notifications/payment-events");
    let technicianName: string | null = null;
    if (invoice.visitId) {
      const visit = await prisma.visit.findFirst({
        where: { id: invoice.visitId, companyId: invoice.companyId },
        select: { assignedUser: { select: { name: true } } },
      });
      technicianName = visit?.assignedUser?.name ?? null;
    }
    await notifyAdminsOfPaymentOutcome({
      companyId: invoice.companyId,
      outcome: "succeeded",
      amount: params.amount,
      customerName: invoice.customer.name,
      technicianName,
      invoiceId: invoice.id,
      visitId: invoice.visitId,
      invoiceNumber: invoice.invoiceNumber,
      methodLabel: params.method === "STRIPE" || !params.method ? "Stripe" : params.method,
      stripePaymentIntentId: params.stripePaymentIntentId ?? null,
    }).catch((err) => {
      console.error("Admin payment-received notify failed:", err);
    });
  }

  if (invoice.visitId && nextStatus === "PAID") {
    const visit = await prisma.visit.findFirst({
      where: { id: invoice.visitId, companyId: invoice.companyId },
      select: { status: true },
    });
    if (visit && visit.status !== "CANCELLED" && visit.status !== "COMPLETED") {
      const { assertVisitCanComplete } = await import("@/lib/checklists/apply");
      const checklistError = await assertVisitCanComplete(invoice.visitId!, invoice.companyId);
      if (!checklistError) {
        await prisma.visit.update({
          where: { id: invoice.visitId! },
          data: { status: "COMPLETED" },
        });
      }
    }
  }

  if (invoice.estimateId && nextStatus === "PAID") {
    const { finalizeEstimateBooking } = await import("@/lib/estimates/booking");
    await finalizeEstimateBooking(invoice.estimateId).catch((err) => {
      console.error("Estimate booking finalize failed:", err);
    });
  }

  if (invoice.company.notifyInvoicePaid) {
    await notifyInvoiceViaTemplates({
      invoiceId: invoice.id,
      companyId: invoice.companyId,
      event: "INVOICE_PAID_RECEIPT",
      // Send both email and SMS when configured (CRM receipt, not Stripe's).
    });
  }

  if (nextStatus === "PAID") {
    const { onReferralInvoicePaid } = await import("@/lib/referrals/conversion");
    await onReferralInvoicePaid({
      companyId: invoice.companyId,
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      invoiceNumber: invoice.invoiceNumber,
      visitId: invoice.visitId,
    }).catch((err) => {
      console.error("Referral invoice paid hook failed:", err);
    });
  }

  return {
    recorded: true,
    alreadyRecorded: false,
    invoiceStatus: nextStatus,
    invoiceId: invoice.id,
  };
}
