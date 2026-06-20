import type Stripe from "stripe";
import { sendEmail } from "@/lib/inbox/sendgrid";
import { sendSms } from "@/lib/inbox/twilio";
import { getInvoicePayUrl } from "@/lib/invoices/pay-url";
import { recordMaintenanceInvoicePayment } from "@/lib/maintenance-plans/discounts";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

type InvoiceWithSubscription = Stripe.Invoice & {
  subscription?: string | Stripe.Subscription | null;
  payment_intent?: string | Stripe.PaymentIntent | null;
  parent?: {
    subscription_details?: {
      subscription?: string | Stripe.Subscription | null;
    };
  };
};

function getSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const inv = invoice as InvoiceWithSubscription;
  if (typeof inv.subscription === "string") return inv.subscription;
  if (inv.subscription && typeof inv.subscription === "object") return inv.subscription.id;
  const parentSub = inv.parent?.subscription_details?.subscription;
  if (typeof parentSub === "string") return parentSub;
  if (parentSub && typeof parentSub === "object") return parentSub.id;
  return null;
}

function getPaymentIntentIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const inv = invoice as InvoiceWithSubscription;
  if (typeof inv.payment_intent === "string") return inv.payment_intent;
  if (inv.payment_intent && typeof inv.payment_intent === "object") return inv.payment_intent.id;
  return null;
}

async function sendPaymentReceipt(params: {
  customerEmail: string | null;
  customerPhone: string | null;
  customerName: string;
  companyName: string;
  sendgridFrom: string | null;
  twilioPhone: string | null;
  invoiceNumber: string;
  amount: number;
  publicToken: string;
}) {
  const payUrl = getInvoicePayUrl(params.publicToken);
  const message = `Payment received for invoice ${params.invoiceNumber}: ${formatCurrency(params.amount)}. View receipt: ${payUrl}`;

  if (params.customerEmail && params.sendgridFrom && process.env.SENDGRID_API_KEY) {
    try {
      await sendEmail({
        from: params.sendgridFrom,
        to: [params.customerEmail],
        subject: `Receipt — Invoice ${params.invoiceNumber}`,
        text: `Hi ${params.customerName},\n\nThank you for your payment of ${formatCurrency(params.amount)} for invoice ${params.invoiceNumber}.\n\nView your invoice: ${payUrl}\n\n— ${params.companyName}`,
        html: `<p>Hi ${params.customerName},</p><p>Thank you for your payment of <strong>${formatCurrency(params.amount)}</strong> for invoice <strong>${params.invoiceNumber}</strong>.</p><p><a href="${payUrl}">View your invoice</a></p><p>— ${params.companyName}</p>`,
      });
    } catch {
      // Receipt email is best-effort
    }
  }

  if (params.customerPhone && params.twilioPhone && process.env.TWILIO_ACCOUNT_SID) {
    try {
      await sendSms({
        from: params.twilioPhone,
        to: params.customerPhone,
        body: message,
      });
    } catch {
      // Receipt SMS is best-effort
    }
  }
}

export async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const invoiceId = session.metadata?.invoiceId;
  if (!invoiceId) return;

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

  if (paymentIntentId) {
    const existing = await prisma.payment.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
    });
    if (existing) return;
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      customer: true,
      company: true,
      payments: true,
    },
  });

  if (!invoice) return;

  const amount = session.amount_total != null ? session.amount_total / 100 : toNumber(invoice.total);

  await prisma.$transaction([
    prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        amount,
        method: "STRIPE",
        stripePaymentIntentId: paymentIntentId ?? null,
      },
    }),
    prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
      },
    }),
  ]);

  await sendPaymentReceipt({
    customerEmail: invoice.customer.email,
    customerPhone: invoice.customer.phone,
    customerName: invoice.customer.name,
    companyName: invoice.company.name,
    sendgridFrom: invoice.company.sendgridFrom,
    twilioPhone: invoice.company.twilioPhone,
    invoiceNumber: invoice.invoiceNumber,
    amount,
    publicToken: invoice.publicToken,
  });
}

export async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionId = getSubscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return;

  const enrollment = await prisma.maintenancePlanEnrollment.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
  });
  if (!enrollment) return;

  const paymentIntentId = getPaymentIntentIdFromInvoice(invoice);

  const amount = (invoice.amount_paid ?? 0) / 100;
  if (amount <= 0) return;

  const period = await prisma.maintenancePlanBillingPeriod.findFirst({
    where: {
      enrollmentId: enrollment.id,
      status: { in: ["DUE", "FAILED", "PENDING"] },
    },
    orderBy: { dueDate: "asc" },
  });

  if (period) {
    const existing = paymentIntentId
      ? await prisma.maintenancePlanBillingPeriod.findFirst({
          where: { stripePaymentIntentId: paymentIntentId },
        })
      : null;
    if (existing) return;

    await recordMaintenanceInvoicePayment({
      companyId: enrollment.companyId,
      customerId: enrollment.customerId,
      enrollmentId: enrollment.id,
      billingPeriodId: period.id,
      amount,
      stripePaymentIntentId: paymentIntentId,
    });
  }

  await prisma.maintenancePlanEnrollment.update({
    where: { id: enrollment.id },
    data: {
      nextBillingDate: invoice.lines?.data[0]?.period?.end
        ? new Date(invoice.lines.data[0].period.end * 1000)
        : undefined,
    },
  });
}

export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = getSubscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return;

  const enrollment = await prisma.maintenancePlanEnrollment.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
  });
  if (!enrollment) return;

  await prisma.maintenancePlanBillingPeriod.updateMany({
    where: {
      enrollmentId: enrollment.id,
      status: { in: ["DUE", "PENDING"] },
    },
    data: { status: "FAILED" },
  });
}

export async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const periodEnd = subscription.items?.data[0]?.current_period_end;
  await prisma.maintenancePlanEnrollment.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      nextBillingDate: periodEnd ? new Date(periodEnd * 1000) : undefined,
    },
  });
}

export async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  await prisma.maintenancePlanEnrollment.updateMany({
    where: { stripeSubscriptionId: subscription.id, status: { not: "CANCELLED" } },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancellationReason: "Stripe subscription cancelled",
    },
  });
}
