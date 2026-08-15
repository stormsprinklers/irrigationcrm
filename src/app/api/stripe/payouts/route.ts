import { NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { getStripePayoutsSummary } from "@/lib/stripe/payouts";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN") {
      return forbiddenResponse();
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
    }

    const summary = await getStripePayoutsSummary();
    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to load payouts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
