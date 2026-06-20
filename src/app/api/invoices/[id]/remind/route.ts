import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { notifyInvoicePayment } from "@/lib/invoices/notify";
import { getInvoiceForCompany } from "@/lib/invoices/queries";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;

    const invoice = await prisma.invoice.findFirst({
      where: { id, companyId: user.companyId },
      include: { customer: true, company: true, payments: true },
    });
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const paid = invoice.payments.reduce((sum, payment) => {
      if (payment.refundedAt) return sum;
      return sum + toNumber(payment.amount);
    }, 0);
    const balanceDue = Math.max(0, toNumber(invoice.total) - paid);
    if (balanceDue <= 0) {
      return NextResponse.json({ error: "Invoice has no balance due" }, { status: 400 });
    }

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
      kind: "remind",
    });

    if (!emailSent && !smsSent) {
      return NextResponse.json(
        { error: "No email or SMS channel configured. Copy the pay link to send manually.", payUrl },
        { status: 503 }
      );
    }

    await prisma.invoice.update({
      where: { id },
      data: { sentAt: new Date(), status: invoice.status === "DRAFT" ? "SENT" : invoice.status },
    });

    const updated = await getInvoiceForCompany(user.companyId, id);
    return NextResponse.json({ invoice: updated, emailSent, smsSent, payUrl });
  } catch {
    return unauthorizedResponse();
  }
}
