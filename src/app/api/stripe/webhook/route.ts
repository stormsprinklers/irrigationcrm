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
import {
  beginWebhookEvent,
  completeWebhookEvent,
  failWebhookEvent,
} from "@/lib/security/webhook-replay";

const MAX_WEBHOOK_BYTES = 1024 * 1024;

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET is not configured" }, { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const body = await request.text();
  if (Buffer.byteLength(body) > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
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

  const claim = await beginWebhookEvent("stripe", event.id);
  if (claim.duplicate) return NextResponse.json({ received: true, duplicate: true });

  try {
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

    await completeWebhookEvent(claim.key);
    return NextResponse.json({ received: true });
  } catch (error) {
    await failWebhookEvent(claim.key, error);
    console.error("Stripe webhook processing failed", { eventId: event.id, type: event.type });
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
