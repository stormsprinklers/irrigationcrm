import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { notifyInvoicePayment } from "@/lib/invoices/notify";
import { getInvoiceForCompany } from "@/lib/invoices/queries";
import { getInvoicePayUrl } from "@/lib/invoices/pay-url";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";

type Params = { params: Promise<{ id: string }> };

async function deliverInvoice(params: {
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

  const { emailSent, smsSent, payUrl } = await notifyInvoicePayment({
    customerName: invoice.customer.name,
    customerEmail: invoice.customer.email,
    customerPhone: invoice.customer.phone,
    companyName: invoice.company.name,
    sendgridFrom: invoice.company.sendgridFrom,
    twilioPhone: invoice.company.twilioPhone,
    invoiceNumber: invoice.invoiceNumber,
    balanceDue,
    publicToken: invoice.publicToken,
    kind: params.kind,
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

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const result = await deliverInvoice({ invoiceId: id, companyId: user.companyId, kind: "send" });
    if ("error" in result && !result.invoice) {
      return NextResponse.json(
        { error: result.error, payUrl: result.payUrl },
        { status: result.status }
      );
    }
    return NextResponse.json(result);
  } catch {
    return unauthorizedResponse();
  }
}
