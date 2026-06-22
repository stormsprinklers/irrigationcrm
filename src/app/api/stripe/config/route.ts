import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getStripePublishableKey } from "@/lib/stripe/client";

export async function GET() {
  try {
    await requireSessionUser();
    const publishableKey = getStripePublishableKey();
    return NextResponse.json({
      publishableKey: publishableKey || null,
      configured: Boolean(publishableKey),
    });
  } catch {
    return unauthorizedResponse();
  }
}
