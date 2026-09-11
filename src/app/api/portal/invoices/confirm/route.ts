import { NextRequest, NextResponse } from "next/server";
import {
  portalUnauthorizedResponse,
  requirePortalCustomer,
} from "@/lib/portal/auth";
import { confirmCheckoutSession } from "@/lib/stripe/confirm-checkout";

export async function POST(request: NextRequest) {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();

  const body = (await request.json().catch(() => ({}))) as { sessionId?: string };
  const sessionId =
    (typeof body.sessionId === "string" ? body.sessionId : null) ??
    request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  try {
    const result = await confirmCheckoutSession(sessionId);
    if (!result.confirmed) {
      return NextResponse.json(result, { status: 202 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Confirmation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
