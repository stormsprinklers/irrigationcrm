import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createInvoiceCheckoutSession } from "@/lib/stripe/invoice-checkout";
import { toNumber } from "@/lib/visits/totals";
import { getInvoicePayUrl } from "@/lib/invoices/pay-url";

type Params = { params: Promise<{ token: string }> };

function computeBalanceDue(
  invoice: { total: unknown; payments: Array<{ amount: unknown; refundedAt: Date | null }> }
) {
  const total = toNumber(invoice.total);
  const paid = invoice.payments.reduce((sum, payment) => {
    if (payment.refundedAt) return sum;
    return sum + toNumber(payment.amount);
  }, 0);
  return Math.max(0, total - paid);
}

export async function POST(_request: NextRequest, { params }: Params) {
  const { token } = await params;

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "STRIPE_SECRET_KEY is not configured" }, { status: 503 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { publicToken: token },
    include: {
      customer: true,
      visit: { select: { title: true } },
      payments: true,
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const balanceDue = computeBalanceDue(invoice);
  if (balanceDue <= 0) {
    return NextResponse.json({ error: "Invoice is already paid" }, { status: 400 });
  }

  if (invoice.status === "VOID" || invoice.status === "REFUNDED") {
    return NextResponse.json({ error: "Invoice cannot be paid" }, { status: 400 });
  }

  const payUrl = getInvoicePayUrl(token);

  try {
    const session = await createInvoiceCheckoutSession({
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        companyId: invoice.companyId,
        visitId: invoice.visitId,
      },
      customerEmail: invoice.customer.email,
      productName: invoice.visit?.title ?? `Invoice ${invoice.invoiceNumber}`,
      amount: balanceDue,
      successUrl: `${payUrl}?payment=success`,
      cancelUrl: `${payUrl}?payment=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
