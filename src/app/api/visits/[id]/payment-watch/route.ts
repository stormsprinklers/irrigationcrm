import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { confirmCheckoutSession } from "@/lib/stripe/confirm-checkout";
import { getStripeClient } from "@/lib/stripe/client";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";

type Params = { params: Promise<{ id: string }> };

function stripeErrorMessage(intent: unknown): string | null {
  if (!intent || typeof intent !== "object") return null;
  const last = (intent as { last_payment_error?: { message?: string | null } }).last_payment_error;
  const message = last?.message?.trim();
  return message || null;
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id: visitId } = await params;

    const visit = await prisma.visit.findFirst({
      where: { id: visitId, companyId: user.companyId },
      include: {
        invoices: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { payments: true },
        },
      },
    });
    if (!visit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const invoice = visit.invoices[0];
    if (!invoice) {
      return NextResponse.json({ paid: false, status: "no_invoice" });
    }

    const paidAmount = invoice.payments.reduce((sum, payment) => {
      if (payment.refundedAt) return sum;
      return sum + toNumber(payment.amount);
    }, 0);
    const balanceDue = Math.max(0, toNumber(invoice.total) - paidAmount);
    if (invoice.status === "PAID" || invoice.paidAt || balanceDue <= 0) {
      return NextResponse.json({ paid: true, status: "paid", invoiceStatus: invoice.status });
    }

    const sessionId = invoice.stripeCheckoutSessionId;
    if (!sessionId || !process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ paid: false, status: "unpaid" });
    }

    const stripe = getStripeClient();
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["payment_intent"],
      });

      if (session.payment_status === "paid") {
        const confirmed = await confirmCheckoutSession(sessionId);
        if (confirmed.confirmed) {
          return NextResponse.json({ paid: true, status: "paid" });
        }
      }

      if (session.status === "expired") {
        return NextResponse.json({
          paid: false,
          status: "expired",
          error: "This checkout expired. Go back and start a new payment.",
        });
      }

      const intentError = stripeErrorMessage(session.payment_intent);
      if (intentError) {
        return NextResponse.json({
          paid: false,
          status: "failed",
          error: intentError,
        });
      }

      return NextResponse.json({ paid: false, status: session.status ?? "open" });
    } catch {
      return NextResponse.json({ paid: false, status: "unpaid" });
    }
  } catch {
    return unauthorizedResponse();
  }
}
