import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { listCustomerCardsOnFile } from "@/lib/customers/stripe";
import type { EstimateInvoiceAmountSelection } from "@/lib/invoices/estimate-invoice-amount";
import { canAccessInvoices } from "@/lib/invoices/permissions";
import { recordInvoicePayment } from "@/lib/invoices/record-payment";
import { syncVisitInvoice } from "@/lib/invoices/sync-visit-invoice";
import { prisma } from "@/lib/prisma";
import {
  cardOnFileIdempotencyKey,
  classifyCardOnFileError,
} from "@/lib/payments/card-on-file";
import { getStripeClient } from "@/lib/stripe/client";

function publicCard(card: Awaited<ReturnType<typeof listCustomerCardsOnFile>>["cards"][number]) {
  return {
    brand: card.brand,
    last4: card.last4,
    expMonth: card.expMonth,
    expYear: card.expYear,
  };
}

async function visitCustomer(visitId: string, companyId: string) {
  return prisma.visit.findFirst({
    where: { id: visitId, companyId },
    select: {
      id: true,
      title: true,
      customerId: true,
      customer: {
        select: { id: true, name: true, email: true, stripeCustomerId: true },
      },
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    if (!canAccessInvoices(user.role)) return forbiddenResponse();
    const visitId = request.nextUrl.searchParams.get("visitId")?.trim();
    if (!visitId) return badRequestResponse("visitId is required");

    const visit = await visitCustomer(visitId, user.companyId);
    if (!visit?.customerId || !visit.customer) {
      return NextResponse.json({ error: "Visit customer not found" }, { status: 404 });
    }
    const { cards } = await listCustomerCardsOnFile({
      customerId: visit.customerId,
      companyId: user.companyId,
    });
    return NextResponse.json({ card: cards[0] ? publicCard(cards[0]) : null });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    if (!canAccessInvoices(user.role)) return forbiddenResponse();
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const visitId = typeof body.visitId === "string" ? body.visitId.trim() : "";
    if (!visitId) return badRequestResponse("visitId is required");

    const visit = await visitCustomer(visitId, user.companyId);
    if (!visit?.customerId || !visit.customer) {
      return NextResponse.json({ error: "Visit customer not found" }, { status: 404 });
    }
    const { stripeCustomerId, cards } = await listCustomerCardsOnFile({
      customerId: visit.customerId,
      companyId: user.companyId,
    });
    const card = cards[0];
    if (!stripeCustomerId || !card) {
      return NextResponse.json(
        { error: "This customer does not have a card on file", code: "CARD_REQUIRED" },
        { status: 400 }
      );
    }

    let amountSelection: EstimateInvoiceAmountSelection | undefined;
    if (body.amountType !== undefined || body.amountValue !== undefined) {
      if (
        (body.amountType !== "PERCENT" && body.amountType !== "FIXED") ||
        typeof body.amountValue !== "number"
      ) {
        return badRequestResponse("Enter a valid payment amount");
      }
      amountSelection = { type: body.amountType, value: body.amountValue };
    }

    const synced = await syncVisitInvoice({
      companyId: user.companyId,
      visitId,
      amountSelection,
    });
    if (!synced.ok) {
      return NextResponse.json({ error: synced.error }, { status: synced.status });
    }
    const requestedAmount =
      typeof body.amount === "number" && body.amount > 0 ? body.amount : null;
    const amount = requestedAmount
      ? Math.min(requestedAmount, synced.balanceDue)
      : synced.balanceDue;
    const amountCents = Math.round(amount * 100);
    if (amountCents <= 0) return badRequestResponse("Nothing due on this visit");

    const stripe = getStripeClient();
    const balanceCents = Math.round(synced.balanceDue * 100);
    const idempotencyKey = cardOnFileIdempotencyKey({
      invoiceId: synced.invoiceId,
      balanceCents,
      amountCents,
    });

    let paymentIntent: Stripe.PaymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create(
        {
          amount: amountCents,
          currency: "usd",
          customer: stripeCustomerId,
          payment_method: card.id,
          off_session: true,
          confirm: true,
          receipt_email: visit.customer.email ?? undefined,
          description: `${visit.title} · Invoice ${synced.invoice.invoiceNumber}`,
          metadata: {
            invoiceId: synced.invoiceId,
            visitId,
            companyId: user.companyId,
            chargedByUserId: user.id,
          },
        },
        { idempotencyKey }
      );

    } catch (error) {
      const { needsCustomer, declineCode } = classifyCardOnFileError(error);
      return NextResponse.json(
        {
          error: needsCustomer
            ? "The bank requires the customer to authenticate this payment. Send the invoice so they can finish securely."
            : "The saved card was declined. Send the invoice or use another payment method.",
          code: needsCustomer ? "PAYMENT_REQUIRES_CUSTOMER" : "CARD_DECLINED",
          declineCode,
          payLink: synced.payLink,
        },
        { status: 402 }
      );
    }

    if (paymentIntent.status !== "succeeded") {
      return NextResponse.json(
        {
          error: "The saved card could not be charged. Send the invoice so the customer can complete payment.",
          code: "PAYMENT_REQUIRES_CUSTOMER",
          payLink: synced.payLink,
        },
        { status: 402 }
      );
    }

    try {
      const recorded = await recordInvoicePayment({
        invoiceId: synced.invoiceId,
        amount,
        method: "STRIPE",
        stripePaymentIntentId: paymentIntent.id,
      });
      if (!recorded) throw new Error("Payment record was not created");
      return NextResponse.json({
        ok: true,
        amount,
        invoiceId: synced.invoiceId,
        invoiceStatus: recorded.invoiceStatus,
        alreadyRecorded: recorded.alreadyRecorded,
        paymentIntentId: paymentIntent.id,
        card: publicCard(card),
      });
    } catch {
      // The database transaction may have committed before a downstream receipt
      // or notification failed. Verify the payment before telling staff to retry.
      const existingPayment = await prisma.payment.findFirst({
        where: {
          invoiceId: synced.invoiceId,
          stripePaymentIntentId: paymentIntent.id,
        },
        select: { invoice: { select: { status: true } } },
      });
      if (existingPayment) {
        return NextResponse.json({
          ok: true,
          amount,
          invoiceId: synced.invoiceId,
          invoiceStatus: existingPayment.invoice.status,
          alreadyRecorded: true,
          paymentIntentId: paymentIntent.id,
          card: publicCard(card),
        });
      }
      return NextResponse.json(
        {
          error: "The card was charged but the invoice payment could not be recorded. Contact support before retrying.",
          code: "PAYMENT_RECORD_FAILED",
          paymentIntentId: paymentIntent.id,
        },
        { status: 500 }
      );
    }
  } catch {
    return unauthorizedResponse();
  }
}
