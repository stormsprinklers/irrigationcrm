import { NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { getPayoutAssociatedPayments } from "@/lib/stripe/payouts";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN") {
      return forbiddenResponse();
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
    }

    const { id } = await params;
    const payments = await getPayoutAssociatedPayments(user.companyId, id);
    return NextResponse.json({ payments });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to load payout payments";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
