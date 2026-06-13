import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getInvoiceForCompany } from "@/lib/invoices/queries";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe/client";
import { toNumber } from "@/lib/visits/totals";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return forbiddenResponse();
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const paymentId = body.paymentId as string | undefined;

    const invoice = await prisma.invoice.findFirst({
      where: { id, companyId: user.companyId },
      include: { payments: true },
    });
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const payment = paymentId
      ? invoice.payments.find((p) => p.id === paymentId)
      : invoice.payments.find((p) => !p.refundedAt && p.stripePaymentIntentId);

    if (!payment) {
      return NextResponse.json({ error: "No refundable payment found" }, { status: 404 });
    }
    if (payment.refundedAt) {
      return NextResponse.json({ error: "Payment already refunded" }, { status: 400 });
    }

    let stripeRefundId: string | null = null;

    if (payment.stripePaymentIntentId && process.env.STRIPE_SECRET_KEY) {
      const stripe = getStripeClient();
      const refund = await stripe.refunds.create({
        payment_intent: payment.stripePaymentIntentId,
        amount: body.amount ? Math.round(Number(body.amount) * 100) : undefined,
      });
      stripeRefundId = refund.id;
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        refundedAt: new Date(),
        stripeRefundId,
      },
    });

    const totalPaid = invoice.payments.reduce((sum, p) => {
      if (p.id === payment.id || p.refundedAt) return sum;
      return sum + toNumber(p.amount);
    }, 0);

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: totalPaid <= 0 ? "REFUNDED" : "PARTIAL",
        paidAt: totalPaid > 0 ? invoice.paidAt : null,
      },
    });

    const updated = await getInvoiceForCompany(user.companyId, id);
    return NextResponse.json(updated);
  } catch {
    return unauthorizedResponse();
  }
}
