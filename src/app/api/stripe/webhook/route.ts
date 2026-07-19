import { NextRequest, NextResponse } from "next/server";
import {
  handleCheckoutSessionAsyncPaymentFailed,
  handleCheckoutSessionAsyncPaymentSucceeded,
  handleCheckoutSessionCompleted,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handlePaymentIntentPaymentFailed,
  handlePaymentIntentSucceeded,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
} from "@/lib/stripe/webhooks";
import { getStripeClient } from "@/lib/stripe/client";

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET is not configured" }, { status: 503 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    await handleCheckoutSessionCompleted(event.data.object);
  }

  if (event.type === "checkout.session.async_payment_succeeded") {
    await handleCheckoutSessionAsyncPaymentSucceeded(event.data.object);
  }

  if (event.type === "checkout.session.async_payment_failed") {
    await handleCheckoutSessionAsyncPaymentFailed(event.data.object);
  }

  if (event.type === "payment_intent.succeeded") {
    await handlePaymentIntentSucceeded(event.data.object);
  }

  if (event.type === "payment_intent.payment_failed") {
    await handlePaymentIntentPaymentFailed(event.data.object);
  }

  if (event.type === "invoice.paid") {
    await handleInvoicePaid(event.data.object);
  }

  if (event.type === "invoice.payment_failed") {
    await handleInvoicePaymentFailed(event.data.object);
  }

  if (event.type === "customer.subscription.deleted") {
    await handleSubscriptionDeleted(event.data.object);
  }

  if (event.type === "customer.subscription.updated") {
    await handleSubscriptionUpdated(event.data.object);
  }

  if (event.type === "account.updated") {
    const { handleConnectAccountUpdated } = await import("@/lib/referrals/stripe-connect");
    const account = event.data.object as { id?: string };
    if (account.id) {
      await handleConnectAccountUpdated(account.id);
    }
  }

  return NextResponse.json({ received: true });
}
