import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { sendEmail } from "@/lib/inbox/sendgrid";
import { sendSms } from "@/lib/inbox/twilio";
import { getInvoiceForCompany } from "@/lib/invoices/queries";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";

type Params = { params: Promise<{ id: string }> };

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;

    const invoice = await prisma.invoice.findFirst({
      where: { id, companyId: user.companyId },
      include: { customer: true, company: true },
    });
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const balance = toNumber(invoice.total);
    if (balance <= 0) return badRequestResponse("Invoice has no balance due");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const payUrl = `${appUrl}/api/invoices/public/${invoice.publicToken}`;
    const message = `Reminder: Invoice ${invoice.invoiceNumber} for ${formatCurrency(balance)} is due. Pay here: ${payUrl}`;

    let emailSent = false;
    let smsSent = false;

    const fromEmail = invoice.company.sendgridFrom ?? process.env.SENDGRID_FROM_EMAIL;
    if (invoice.customer.email && fromEmail && process.env.SENDGRID_API_KEY) {
      try {
        await sendEmail({
          from: fromEmail,
          to: [invoice.customer.email],
          subject: `Payment reminder — Invoice ${invoice.invoiceNumber}`,
          text: `Hi ${invoice.customer.name},\n\nThis is a reminder that invoice ${invoice.invoiceNumber} for ${formatCurrency(balance)} is outstanding.\n\nPay online: ${payUrl}\n\n— ${invoice.company.name}`,
          html: `<p>Hi ${invoice.customer.name},</p><p>This is a reminder that invoice <strong>${invoice.invoiceNumber}</strong> for <strong>${formatCurrency(balance)}</strong> is outstanding.</p><p><a href="${payUrl}">Pay online</a></p><p>— ${invoice.company.name}</p>`,
        });
        emailSent = true;
      } catch {
        // best-effort
      }
    }

    if (invoice.customer.phone && invoice.company.twilioPhone && process.env.TWILIO_ACCOUNT_SID) {
      try {
        await sendSms({
          from: invoice.company.twilioPhone,
          to: invoice.customer.phone,
          body: message,
        });
        smsSent = true;
      } catch {
        // best-effort
      }
    }

    if (!emailSent && !smsSent) {
      return NextResponse.json({ error: "No email or SMS channel configured" }, { status: 503 });
    }

    await prisma.invoice.update({
      where: { id },
      data: { sentAt: new Date(), status: invoice.status === "DRAFT" ? "SENT" : invoice.status },
    });

    const updated = await getInvoiceForCompany(user.companyId, id);
    return NextResponse.json({ invoice: updated, emailSent, smsSent });
  } catch {
    return unauthorizedResponse();
  }
}
