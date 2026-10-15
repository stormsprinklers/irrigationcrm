import { NextRequest, NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/security/trusted-request";

/** Expense cards are deprecated — do not fund Stripe Issuing. */
export async function GET(request: NextRequest) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;

  return NextResponse.json({ ok: true, deprecated: true, checked: 0 });
}
