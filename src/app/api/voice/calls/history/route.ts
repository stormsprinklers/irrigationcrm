import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { listCallHistory } from "@/lib/voice/call-history-queries";
import { backfillCallLogCustomers } from "@/lib/voice/backfill-call-customers";
import { backfillCallLogEmployees } from "@/lib/voice/backfill-call-employees";

export async function GET() {
  try {
    const user = await requireSessionUser();
    await backfillCallLogCustomers({ companyId: user.companyId, take: 300 }).catch(() => {});
    await backfillCallLogEmployees({ companyId: user.companyId, take: 300 }).catch(() => {});
    const calls = await listCallHistory(user.companyId);
    return NextResponse.json({ calls });
  } catch {
    return unauthorizedResponse();
  }
}
