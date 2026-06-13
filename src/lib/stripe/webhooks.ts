import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/inbox/sendgrid";
import { sendSms } from "@/lib/inbox/twilio";
import { toNumber } from "@/lib/visits/totals";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const payUrl = `${appUrl}/api/invoices/public/${params.publicToken}`;
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
