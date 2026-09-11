import { NextRequest, NextResponse } from "next/server";

/** Expense cards are deprecated — do not fund Stripe Issuing. */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, deprecated: true, checked: 0 });
}
