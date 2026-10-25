import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { confirmCheckoutSession } from "@/lib/stripe/confirm-checkout";
import { getStripeClient } from "@/lib/stripe/client";
import { prisma } from "@/lib/prisma";
import { computeTotals, sumDiscounts, sumLineItems, toNumber } from "@/lib/visits/totals";
import { attachEstimateInvoicesForVisit } from "@/lib/estimates/attach-invoices-to-visit";

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
    await attachEstimateInvoicesForVisit({ companyId: user.companyId, visitId });

    const visit = await prisma.visit.findFirst({
      where: { id: visitId, companyId: user.companyId },
      include: {
        lineItems: true,
        discounts: true,
        invoices: {
          orderBy: { createdAt: "desc" },
          include: { payments: true },
        },
      },
    });
    if (!visit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!visit.invoices.length) {
      return NextResponse.json({ paid: false, status: "no_invoice" });
    }

    const subtotal = sumLineItems(visit.lineItems);
    const discountTotal = sumDiscounts(subtotal, visit.discounts);
    const { total } = computeTotals(subtotal, discountTotal);
    const paidAmount = visit.invoices.reduce((invoiceSum, candidate) => {
      if (candidate.status === "VOID") return invoiceSum;
      const recorded = candidate.payments.reduce((sum, payment) => {
        if (payment.refundedAt) return sum;
        return sum + toNumber(payment.amount);
      }, 0);
      return invoiceSum +
        (recorded > 0 || candidate.status !== "PAID" ? recorded : toNumber(candidate.total));
    }, 0);
    const balanceDue = Math.max(0, total - paidAmount);
    if (total > 0 && paidAmount > 0 && balanceDue <= 0.005) {
      return NextResponse.json({ paid: true, status: "paid" });
    }

    const invoice =
      visit.invoices.find(
        (candidate) =>
          candidate.stripeCheckoutSessionId &&
          !candidate.invoiceNumber.includes("-DEP-") &&
          !candidate.invoiceNumber.includes("-PAY-")
      ) ?? visit.invoices.find((candidate) => candidate.stripeCheckoutSessionId);
    if (!invoice) return NextResponse.json({ paid: false, status: "unpaid", balanceDue });

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
