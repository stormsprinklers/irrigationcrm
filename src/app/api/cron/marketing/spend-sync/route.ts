import { NextRequest, NextResponse } from "next/server";
import { syncMarketingSpendDaily } from "@/lib/marketing/spend-sync";
import { authorizeCronRequest } from "@/lib/security/trusted-request";

export async function GET(request: NextRequest) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;

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
