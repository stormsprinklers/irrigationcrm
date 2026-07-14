import { NextRequest, NextResponse } from "next/server";
import { syncMarketingSpendDaily } from "@/lib/marketing/spend-sync";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const backfillParam = request.nextUrl.searchParams.get("backfillDays");
    const companyId = request.nextUrl.searchParams.get("companyId") ?? undefined;
    const backfillDays = backfillParam ? Number(backfillParam) : undefined;
    const result = await syncMarketingSpendDaily({
      backfillDays:
        backfillDays != null && Number.isFinite(backfillDays) ? backfillDays : undefined,
      companyId,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Spend sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
