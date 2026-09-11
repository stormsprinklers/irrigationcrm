import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const DEFAULT_STRIPE_VERSION = "2025-03-31.basil";

/**
 * Stripe Issuing authorization webhook.
 * Company expense cards are deprecated — always decline.
 */
function authorizationResponse(approved: boolean, apiVersion?: string | null) {
  return NextResponse.json(
    { approved },
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Stripe-Version": apiVersion || DEFAULT_STRIPE_VERSION,
      },
    }
  );
}

export async function POST(request: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const secrets = [
    process.env.STRIPE_ISSUING_AUTH_WEBHOOK_SECRET,
    process.env.STRIPE_WEBHOOK_SECRET,
  ].filter((s): s is string => Boolean(s?.trim()));

  if (!secretKey || secrets.length === 0) {
    return authorizationResponse(false);
  }

  const stripe = new Stripe(secretKey);
  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  if (!signature) {
    return authorizationResponse(false);
  }

  let event: Stripe.Event | null = null;
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
      break;
    } catch {
      // try next secret
    }
  }

  if (!event) {
    return authorizationResponse(false);
  }

  return authorizationResponse(false, event.api_version);
}
