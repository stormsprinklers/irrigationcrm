import { AppNotificationType, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notifyStaffInApp } from "@/lib/notifications/in-app";
import { getInvoicePayUrl } from "@/lib/invoices/pay-url";
import { createStripeCheckoutPayUrl } from "@/lib/stripe/invoice-checkout";
import { notifyInvoiceViaTemplates } from "@/lib/notifications/invoice-notify";
import { toNumber } from "@/lib/visits/totals";

function formatAmount(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

async function resolveTechnicianName(params: {
  companyId: string;
  visitId: string | null;
}): Promise<string | null> {
  if (!params.visitId) return null;
  const visit = await prisma.visit.findFirst({
    where: { id: params.visitId, companyId: params.companyId },
    select: { assignedUser: { select: { name: true } } },
  });
  return visit?.assignedUser?.name ?? null;
}

async function adminUserIds(companyId: string) {
  const admins = await prisma.user.findMany({
    where: {
      companyId,
      status: "ACTIVE",
      role: { in: [UserRole.ADMIN, UserRole.MANAGER] },
    },
    select: { id: true },
  });
  return admins.map((user) => user.id);
}

/** In-app + PWA/APNs alert for admins when a payment succeeds or fails. */
export async function notifyAdminsOfPaymentOutcome(params: {
  companyId: string;
  outcome: "succeeded" | "failed";
  amount: number;
  customerName: string;
  technicianName?: string | null;
  invoiceId: string;
  visitId: string | null;
  invoiceNumber?: string | null;
  methodLabel?: string | null;
  stripePaymentIntentId?: string | null;
}) {
  const userIds = await adminUserIds(params.companyId);
  if (!userIds.length) return;

  const technicianName =
    params.technicianName !== undefined
      ? params.technicianName
      : await resolveTechnicianName({
          companyId: params.companyId,
          visitId: params.visitId,
        });

  const amountLabel = formatAmount(params.amount);
  const title =
    params.outcome === "succeeded" ? "Payment received" : "Payment failed";
  const body = [
    `${amountLabel} · ${params.customerName}`,
    technicianName ? `Tech: ${technicianName}` : null,
    params.invoiceNumber ? `Invoice ${params.invoiceNumber}` : null,
    params.methodLabel ?? null,
  ]
    .filter(Boolean)
    .join(" · ");

  const href = params.visitId
    ? `/visits/${params.visitId}`
    : `/customers/invoices?invoiceId=${params.invoiceId}`;

  const hrefWithPi =
    params.stripePaymentIntentId != null
      ? `${href}${href.includes("?") ? "&" : "?"}pi=${encodeURIComponent(params.stripePaymentIntentId)}`
      : href;

  // Deduplicate failure alerts for the same PaymentIntent (Stripe retries webhooks).
  if (params.outcome === "failed" && params.stripePaymentIntentId) {
    const existing = await prisma.appNotification.findFirst({
      where: {
        companyId: params.companyId,
        type: AppNotificationType.PAYMENT_FAILED,
        href: { contains: params.stripePaymentIntentId },
      },
      select: { id: true },
    });
    if (existing) return;
  }

  await notifyStaffInApp({
    companyId: params.companyId,
    type:
      params.outcome === "succeeded"
        ? AppNotificationType.PAYMENT_RECEIVED
        : AppNotificationType.PAYMENT_FAILED,
    title,
    body,
    href: hrefWithPi,
    userIds,
  });
}

/** @deprecated Prefer notifyAdminsOfPaymentOutcome */
export async function notifyCashCheckPayment(params: {
  companyId: string;
  invoiceId: string;
  visitId: string | null;
  amount: number;
  method: "CASH" | "CHECK";
  customerName: string;
  invoiceNumber: string;
  recordedByUserId: string | null;
}) {
  let recordedByName: string | null = null;
  if (params.recordedByUserId) {
    recordedByName =
      (
        await prisma.user.findFirst({
          where: { id: params.recordedByUserId, companyId: params.companyId },
          select: { name: true },
        })
      )?.name ?? null;
  }

  await notifyAdminsOfPaymentOutcome({
    companyId: params.companyId,
    outcome: "succeeded",
    amount: params.amount,
    customerName: params.customerName,
    invoiceId: params.invoiceId,
    visitId: params.visitId,
    invoiceNumber: params.invoiceNumber,
    methodLabel:
      params.method === "CASH"
        ? recordedByName
          ? `Cash · Recorded by ${recordedByName}`
          : "Cash"
        : recordedByName
          ? `Check · Recorded by ${recordedByName}`
          : "Check",
  });
}

/**
 * Customer CRM email/SMS + admin alert after a Stripe payment failure.
 * Retry link is a fresh Stripe Checkout session.url when possible.
 */
export async function handleInvoicePaymentFailure(params: {
  invoiceId: string;
  amount?: number | null;
  stripePaymentIntentId?: string | null;
  stripeEventId?: string | null;
}) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.invoiceId },
    include: {
      customer: true,
      company: true,
      payments: true,
      visit: { select: { id: true, assignedUser: { select: { name: true } } } },
    },
  });
  if (!invoice?.customer) return;

  if (params.stripePaymentIntentId) {
    const already = await prisma.appNotification.findFirst({
      where: {
        companyId: invoice.companyId,
        type: AppNotificationType.PAYMENT_FAILED,
        href: { contains: params.stripePaymentIntentId },
      },
      select: { id: true },
    });
    if (already) return;
  }

  const paid = invoice.payments.reduce((sum, payment) => {
    if (payment.refundedAt) return sum;
    return sum + toNumber(payment.amount);
  }, 0);
  const balanceDue = Math.max(0, toNumber(invoice.total) - paid);
  const amount = params.amount != null && params.amount > 0 ? params.amount : balanceDue;
  if (amount <= 0) return;

  let retryUrl = getInvoicePayUrl(invoice.publicToken);
  try {
    const checkout = await createStripeCheckoutPayUrl({
      invoiceId: invoice.id,
      companyId: invoice.companyId,
    });
    if (checkout?.url) retryUrl = checkout.url;
  } catch (err) {
    console.error("Failed to create Stripe retry checkout URL:", err);
  }

  const companyFlags = invoice.company as {
    notifyInvoicePaymentFailed?: boolean;
  };
  if (companyFlags.notifyInvoicePaymentFailed !== false) {
    await notifyInvoiceViaTemplates({
      invoiceId: invoice.id,
      companyId: invoice.companyId,
      event: "INVOICE_PAYMENT_FAILED",
      payUrlOverride: retryUrl,
      amountOverride: amount,
    }).catch((err) => {
      console.error("Customer payment-failed notify failed:", err);
    });
  }

  await notifyAdminsOfPaymentOutcome({
    companyId: invoice.companyId,
    outcome: "failed",
    amount,
    customerName: invoice.customer.name,
    technicianName: invoice.visit?.assignedUser?.name ?? null,
    invoiceId: invoice.id,
    visitId: invoice.visitId,
    invoiceNumber: invoice.invoiceNumber,
    methodLabel: "Stripe",
    stripePaymentIntentId: params.stripePaymentIntentId ?? null,
  }).catch((err) => {
    console.error("Admin payment-failed notify failed:", err);
  });
}
