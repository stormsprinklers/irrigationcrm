import { NextRequest, NextResponse } from "next/server";
import { runExpenseCardAutoTopUps } from "@/lib/expense-cards/auto-topup";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await runExpenseCardAutoTopUps();
    return NextResponse.json({
      ok: true,
      checked: results.length,
      results,
    });
  } catch (err) {
    console.error("[cron] expense-card-topup failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Top-up cron failed" },
      { status: 500 }
    );
  }
}
